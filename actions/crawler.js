const axios = require('axios')
const cheerio = require('cheerio')
const { AUTH, OPENAI_KEY, APIKEY } = process.env
const { generateUpdatesObject, formatString, formatUrl, formatEmail } = require('../utils')
const { maximumParallelLoops, maximumRelativesToCrawl } = require('../config')
const { mapLimit, sleep } = require('modern-async')
const OpenAI = require('openai');
const { notifySlack } = require('./slack')
const openai = new OpenAI({ apiKey: OPENAI_KEY });
function cleanPhoneDuplicates(labeledPhones) {
  const seen = new Set();
  const finalList = [];

  for (const phone of labeledPhones) {
    const normalized = phone.replace(/^[WLU]\s/, '').trim(); // quita prefijo
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    finalList.push(phone);
  }

  return finalList;
}
function normalizeAddress(address) {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '') // elimina espacios, comas, etc.
    .replace(/\bapt\b/g, '')    // quita 'apt'
    .replace(/\bs\b/g, '')      // quita 's'
    .replace(/\bave\b/g, '')    // quita 'ave'
    .replace(/\besplanade\b/g, '') // opcional, si querés ser más laxo
    .trim();
}
class Crawler {
    constructor() {
        this.axiosInstance = axios.create({
            baseURL: `https://app.scrapingbee.com/api/v1`,
        })
        this.axiosBizFileInstance = axios.create({
            baseURL: 'https://bizfileonline.sos.ca.gov',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'undefined',
                'User-Agent': 'PostmanRuntime/7.28.4',
                'Host': ''
            }
        })
        this.requestCount = 0
    }

    /**
     * Take the url and returns HTTP response body
     * @param {string} url 
     * @returns {httpResponseBody} 
     */

    async checkPhoneType(phoneNumber) {
  const prompt = `Is the phone number "${phoneNumber}" a wireless/mobile or landline number in the United States? Reply only with "W" for wireless or "L" for landline.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an assistant that knows whether a US phone number is wireless (mobile) or landline. Only answer "W" or "L".' },
        { role: 'user', content: prompt }
      ],
      temperature: 0
    });

    const type = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (type === 'W' || type === 'L') return type;
    return 'U'; // Unknown
  } catch (error) {
    console.error(`Error determining phone type for ${phoneNumber}:`, error.message);
    return 'U';
  }
}
async labelPhoneNumbers(phoneNumbers) {
  const seen = new Set();
  const cleanedPhones = phoneNumbers
    .map(p => p.trim())
    .filter(p => /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(p)); // básico: (123) 456-7890 o 123-456-7890

  const uniquePhones = [...new Set(cleanedPhones)];

  if (uniquePhones.length === 0) return [];

  const prompt = `
Label the following US phone numbers as Wireless (W), Landline (L), or Unknown (U).
Return ONLY one per line, in this format: "W (123) 456-7890", "L (123) 456-7890", or "U (123) 456-7890".

Numbers:
${uniquePhones.join('\n')}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an assistant that classifies US phone numbers as Wireless (W), Landline (L), or Unknown (U).' },
        { role: 'user', content: prompt }
      ],
      temperature: 0
    });

    const rawOutput = response.choices[0]?.message?.content || '';

    const lines = rawOutput
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^[WLU] \(\d{3}\) \d{3}-\d{4}$/.test(l));

    const map = new Map(lines.map(l => [l.slice(2), l])); // clave sin prefijo

    // fallback U para los que no fueron etiquetados por el modelo
    const finalList = uniquePhones.map(phone => {
      const normalized = this.normalizePhone(phone);
      return map.get(normalized) || `U ${normalized}`;
    });

    // quitar duplicados con prioridad W > L > U
    return this.cleanPhoneDuplicatesSmart(finalList);
  } catch (error) {
    console.error("🔥 GPT labeling error:", error.message);
    return uniquePhones.map(p => `U ${this.normalizePhone(p)}`);
  }
}
cleanPhoneDuplicatesSmart(labeledPhones) {
  const byNumber = {};

  for (const phone of labeledPhones) {
    const match = phone.match(/^([WLU]) (\(\d{3}\) \d{3}-\d{4})$/);
    if (!match) continue;

    const [ , type, number ] = match;
    const current = byNumber[number];

    if (!current || this.isBetterType(type, current.type)) {
      byNumber[number] = { phone: `${type} ${number}`, type };
    }
  }

  return Object.values(byNumber).map(entry => entry.phone);
}

isBetterType(newType, currentType) {
  const priority = { 'W': 3, 'L': 2, 'U': 1 };
  return priority[newType] > priority[currentType];
}
normalizePhone(phone) {
  const match = phone.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (!match) return phone;
  const digits = phone.replace(/\D/g, '');
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}
async addressesMatchUsingAI(a, b) {
    const prompt = `Do "${a}" and "${b}" refer to the same person or address? Reply only with true or false.`;

    try {
        const res = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are an assistant that compares two names or addresses. Only respond with "true" or "false".' },
                { role: 'user', content: prompt }
            ],
            temperature: 0
        });
        return res.choices[0]?.message?.content?.trim().toLowerCase() === 'true';
    } catch (err) {
        console.error("🧠 Error comparing via OpenAI:", err.message);
        return false;
    }
}
    
async getHtmlContent(url) {
  let result = "";
  try {
    const response = await this.axiosInstance.get("", {
      params: {
        api_key: APIKEY,
        url: url,
        render_js: true,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    this.requestCount++;
    result = response.data;
    notifySlack(`✅ Scraping exitoso: ${url}`);

    // ⏳ Esperá 2 segundos entre requests
await sleep(Math.floor(Math.random() * 3000) + 4000); // entre 4 y 7 segundos
  } catch (error) {
    notifySlack(`❌ Error al obtener HTML: ${url} - ${error.message}`);
    console.error("❌ Error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data?.slice?.(0, 200)
    });
    await sleep(3000); // un poco más si falla
  } finally {
    return result;
  }
}

    /**
     * Searches through the site and Gives back phone number of matching user, relatives, Relatives phone, associates
     * @param {string} mailingAddress 
     * @param {string} city 
     * @param {string} state 
     * @param {object} ownerDetails 
     * @returns {object}
     */
    async searchByAddress(address, city, state, ownerDetails) {
        try {
            let currentPage = 1;
            let allPhoneNumbers = [];
            let isUserMatched = false
            let allRelatives = [], allAssociates = [], allRelativeNames = [], allAssociateNames = [], allEmails = []

            while (true) {
                const formattedAddress = formatString(address)
                const formattedCity = formatString(city)
                const formattedState = formatString(state)
                const url = `https://www.cyberbackgroundchecks.com/address/${formattedAddress}/${formattedCity}/${formattedState}/${currentPage}`

                console.log(`Crawling page no ${currentPage}, URL: ${url}`)

                const html = await this.getHtmlContent(url);

                // First try to see if the user exists, if it does return its detail profile url
                const { profileURL, isMatchfound, cardPhoneNumbers } = await this.getDetailsProfileURL(ownerDetails, html, address);
                isUserMatched = isUserMatched ? true : isMatchfound
                if(cardPhoneNumbers) allPhoneNumbers.push(...cardPhoneNumbers)

                if (isUserMatched) {
                    const processedData = await this.processUserMatched(profileURL, allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails);
                    ({ allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails } = processedData);
                }

                const nextPageAvailable = await this.checkIfNextPageExists(html)
                if (!nextPageAvailable) break;
                currentPage++;
            }

            return { allPhoneNumbers, isUserMatched, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails };
        } catch (error) {
            console.error(`Error searching user by address: ${address}: `, error);
            return { allPhoneNumbers: [], isUserMatched: false, allRelatives: [], allAssociates: [], allRelativeNames: [], allAssociateNames: [], allEmails: [] }
        }
    }

    /**
     * 
     * @param {string} name 
     * @param {string} propertyAddress 
     * @param {string} address 
     * @param {string} city 
     * @param {string} state 
     * @returns {object}
     */
    async searchByName(name, propertyAddress, address, city, state) {
        try {
            let currentPage = 1
            let allPhoneNumbers = [];
            let isUserMatched = false
            let allRelatives = [], allAssociates = [], allRelativeNames = [], allAssociateNames = [], allEmails = []

            while (true) {
                const formattedName = formatString(name)
                const formattedCity = formatString(city)
                const formattedState = formatString(state)
                const url = `https://www.cyberbackgroundchecks.com/people/${formattedName}/${formattedState}/${formattedCity}/${currentPage}`

                console.log(`Crawling page no ${currentPage}, URL: ${url}`)

                const html = await this.getHtmlContent(url)

                // First try to see if the user exists, if it does return its detail profile url
                const { profileURL, isMatchfound, cardPhoneNumbers } = await this.getDetailsProfileURLByAddress(address, propertyAddress, html);
                isUserMatched = isUserMatched ? true : isMatchfound
                if(cardPhoneNumbers) allPhoneNumbers.push(...cardPhoneNumbers)

                if (isUserMatched) {
                    const processedData = await this.processUserMatched(profileURL, allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails);
                    ({ allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails } = processedData);
                }

                const nextPageAvailable = await this.checkIfNextPageExists(html)
                if (!nextPageAvailable) break;
                currentPage++;
            }

            return { allPhoneNumbers, isUserMatched, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails }
        } catch (error) {
            console.error("Error searching user by name,", error)
            return { allPhoneNumbers: [], isUserMatched: false, allRelatives: [], allAssociates: [], allRelativeNames: [], allAssociateNames: [], allEmails: [] }
        }
    }

isValidPhone(phone) {
  return /^\(\d{3}\)\s?\d{3}-\d{4}$/.test(phone);
}

async checkPhoneType(phoneNumber) {
  const prompt = `Is the phone number "${phoneNumber}" a wireless/mobile or landline number in the United States? Reply only with "W" for wireless or "L" for landline.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an assistant that knows whether a US phone number is wireless (mobile) or landline. Only answer "W" or "L".' },
        { role: 'user', content: prompt }
      ],
      temperature: 0
    });

    const type = response.choices[0]?.message?.content?.trim().toUpperCase();
    return ['W', 'L'].includes(type) ? type : 'U';
  } catch (error) {
    console.error(`Error determining phone type for ${phoneNumber}:`, error.message);
    return 'U';
  }
}

async labelPhoneNumbers(phoneNumbers) {
  const labeled = [];
  const seen = new Set();

  for (const raw of phoneNumbers) {
    const phone = raw.trim();
    if (seen.has(phone)) continue;
    seen.add(phone);

    const type = this.isValidPhone(phone) ? await this.checkPhoneType(phone) : 'U';
    labeled.push(`${type} ${phone}`);
  }

  return labeled;
}
    
    /**
     * Takes Both addresses and returns profile URL of matched address.
     * @param {string} mailingAddress 
     * @param {string propertyAddress 
     * @param {httpResponseBody} htmlContent 
     * @returns {object}
     */
    async getDetailsProfileURLByAddress(mailingAddress, propertyAddress, htmlContent) {
    let profileURL = '';
    let isMatchfound = false;
    const cardPhoneNumbers = [];

    try {
        const data = this.extractDataFromLdJson(htmlContent);

        if (data) {
            const { telephones, addresses, profileURL: extractedUrl } = data;

            // Normalizá las direcciones a minúsculas
            const targetAddresses = [mailingAddress, propertyAddress].map(a =>
                a?.toLowerCase().trim()
            );

         const matchFound = addresses?.some(addr => {
    const addressFull = addr.full?.toLowerCase() || '';
    return targetAddresses.some(target =>
        addressFull.includes(target.toLowerCase()) ||
        addressFull.replace(/[^a-z0-9]/gi, '').includes(target.replace(/[^a-z0-9]/gi, ''))
    );
});

            if (matchFound) {
                isMatchfound = true;
                profileURL = extractedUrl || '';
                cardPhoneNumbers.push(...(telephones || []));
            }
        }
    } catch (error) {
        console.error(`Error extracting profile URL by address`, error);
    }

    return { profileURL, isMatchfound, cardPhoneNumbers };
}

extractDataFromLdJson(html) {
    const $ = cheerio.load(html);
    let result = null;

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const raw = $(el).html()?.trim();
            if (!raw) return;

            const json = JSON.parse(raw);

            const jsonObjects = Array.isArray(json) ? json : [json];

            const person = jsonObjects.find(entry => entry['@type'] === 'Person');

            if (person) {
                result = {
                    name: person.name,
                    telephones: person.telephone || [],
                    addresses: (person.address || []).map(addr => ({
                        street: addr.streetAddress,
                        city: addr.addressLocality,
                        state: addr.addressRegion,
                        postalCode: addr.postalCode,
                        full: `${addr.streetAddress}, ${addr.addressLocality}, ${addr.addressRegion} ${addr.postalCode}`
                    })),
                    profileURL: person.url || person['@id'] || null
                };
            }
        } catch (err) {
            console.warn("⚠️ Error parsing JSON from <script type='ld+json'>:", err.message);
        }
    });

    return result;
}

    /**
     * Main function responsible to extract all details from the profile and give us back proper data
     * @param {string} profileURL 
     * @param {Array} allPhoneNumbers 
     * @param {Array} allRelatives 
     * @param {Array} allAssociates 
     * @param {Array} allRelativeNames 
     * @param {Array} allAssociateNames 
     * @param {Array} allEmails 
     * @returns {Object}
     */

async labelAllPhoneNumbersBatch(results) {
  for (const row of results) {
    if (!Array.isArray(row.phoneNumbers)) continue;

    const labeled = await this.labelPhoneNumbers(row.phoneNumbers);
    row.phoneNumbers = this.cleanPhoneDuplicatesSmart(labeled); // o solo labeled si no tenés esa función
  }
  return results;
}
    
 async processUserMatched(profileURL, allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails) {
  try {
    const { phoneNumbers, relatives, associates, relativeNames, associateNames, emailAddresses } = await this.extractDetailsByUrl(profileURL);

    // ✅ Normalizar, eliminar duplicados y etiquetar
let labeledPhones = await this.labelPhoneNumbers(phoneNumbers);
labeledPhones = cleanPhoneDuplicates(labeledPhones);

// 🧽 Filtro extra de duplicados, ignorando letras

labeledPhones.forEach(phone => {
  if (!allPhoneNumbers.includes(phone)) allPhoneNumbers.push(phone);
});
labeledPhones.forEach(phone => {
  if (!allPhoneNumbers.includes(phone)) allPhoneNumbers.push(phone);
});
    // ✅ Guardar solo los únicos etiquetados
    labeledPhones.forEach(phone => {
      if (!allPhoneNumbers.includes(phone)) allPhoneNumbers.push(phone);
    });

    relatives.forEach(relative => {
      if (!allRelatives.includes(relative)) allRelatives.push(relative);
    });

    associates.forEach(associate => {
      if (!allAssociates.includes(associate)) allAssociates.push(associate);
    });

    relativeNames.forEach(relative => {
      if (!allRelativeNames.includes(relative)) allRelativeNames.push(relative);
    });

    associateNames.forEach(associate => {
      if (!allAssociateNames.includes(associate)) allAssociateNames.push(associate);
    });

    emailAddresses.forEach(email => {
      if (!allEmails.includes(email)) allEmails.push(email);
    });

    return { allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails };
  } catch (error) {
    console.error(`Error processing user details: `, error);
    return { allPhoneNumbers, allRelatives, allAssociates, allRelativeNames, allAssociateNames, allEmails };
  }
}

    /**
     * Takes owner name and returns back matching profile URL
     * @param {object} ownerDetails 
     * @param {httpResponseBody} htmlContent 
     * @returns {object}
     */
async getDetailsProfileURL(ownerDetails, htmlContent, address) {
        try {
            let profileURL = '';
            let isMatchfound = false;
            let cardPhoneNumbers = []
            const $ = cheerio.load(htmlContent);

            const cardList = $('.card');

            function pushPhone(phoneNumbers){
                phoneNumbers.each((index, element) => {
                    const phoneNumber = $(element).text().trim();
                    if (phoneNumber) cardPhoneNumbers.push(phoneNumber);
                });
            }

            for (let index = 0; index < cardList.length; index++) {
                const card = cardList.eq(index);
                const nameGiven = card.find('.name-given');

                const phoneNumbers = $(card).find('.phone')

                if (nameGiven.length > 0) {
                    const cardFullName = nameGiven.text().trim();
                    const ownerOneFullNAme = `${ownerDetails.ownerOneFirstName} ${ownerDetails.ownerOneLastName}`;
                    const ownerTwoFullNAme = `${ownerDetails.ownerTwoFirstName} ${ownerDetails.ownerTwoLastName}`;
                    const cardAddress = card.find('.address-current').text().trim();

                    if (
                        (ownerOneFullNAme.length && cardFullName === ownerOneFullNAme) ||
                        (ownerTwoFullNAme.length && cardFullName === ownerTwoFullNAme)
                    ) {
                        isMatchfound = true;
                        profileURL = card.find('[title*="View full"]').attr('href');
                        pushPhone(phoneNumbers)
                        return { profileURL: profileURL, isMatchfound: isMatchfound, cardPhoneNumbers };
                    }
                    else if (
                        (ownerDetails.ownerOneFirstName?.length && ownerDetails.ownerOneLastName?.length &&
                            cardFullName.includes(ownerDetails.ownerOneFirstName) && cardFullName.includes(ownerDetails.ownerOneLastName)) ||
                        (ownerDetails?.ownerTwoFirstName?.length && ownerDetails?.ownerTwoLastName?.length &&
                            cardFullName.includes(ownerDetails.ownerTwoFirstName) && cardFullName.includes(ownerDetails.ownerTwoLastName))
                    ) {
                        isMatchfound = true;
                        profileURL = card.find('[title*="View full"]').attr('href');
                        pushPhone(phoneNumbers)
                        return { profileURL: profileURL, isMatchfound: isMatchfound, cardPhoneNumbers };
                    }
                    else if (
                        (
                            !ownerDetails.ownerOneFirstName?.length && ownerDetails.ownerOneLastName?.length &&
                            cardFullName.includes(ownerDetails.ownerOneLastName) && cardAddress.includes(address)
                        )
                        ||
                        (
                            !ownerDetails.ownerTwoFirstName?.length && ownerDetails.ownerTwoLastName?.length &&
                            cardFullName.includes(ownerDetails.ownerTwoLastName) && cardAddress.includes(address)
                        )
                    ) {
                        isMatchfound = true;
                        profileURL = card.find('[title*="View full"]').attr('href');
                        pushPhone(phoneNumbers)
                        return { profileURL: profileURL, isMatchfound: isMatchfound, cardPhoneNumbers };
                    }
                }
            }
        } catch (error) {
            console.error(`Error extracting profile URL`, error);
        }

        // Return a default value if no match is found
        return { profileURL: '', isMatchfound: false, cardPhoneNumbers: [] };
    }


    /**
     * Extracts phone numbers, relatives, associates from the profile url
     * @param {string} url 
     * @returns 
     */
    async extractDetailsByUrl(url) {
        try {
            let phoneNumbers = [], relatives = [], associates = [], relativeNames = [], associateNames = [], emailAddresses = []
            const formattedURL = formatUrl(url)

            // Now lets browse the details profile url
            const html = await this.getHtmlContent(formattedURL);

            // Lets extract Phone numbers, Relatives and Associates
            relatives = await this.extractDetailsByRowLabel(html, "Possible Relatives", "a", "href")
            associates = await this.extractDetailsByRowLabel(html, "Possible Associates", "a", "href")
            phoneNumbers = await this.extractDetailsByRowLabel(html, "Phone Numbers", ".phone")
            relativeNames = await this.extractDetailsByRowLabel(html, "Possible Relatives", ".relative")
            associateNames = await this.extractDetailsByRowLabel(html, "Possible Associates", ".associate")
            emailAddresses = await this.extractDetailsByRowLabel(html, "Email Addresses", "a", "href")
            const formattedEmails = emailAddresses.map(formatEmail);
            return { phoneNumbers, relatives, associates, relativeNames, associateNames, emailAddresses: formattedEmails }
        } catch (error) {
            console.error("Error extracting details by details url", url, error)
            return { phoneNumbers: [], relatives: [], associates: [], relativeNames: [], associateNames: [], emailAddresses: [] }
        }
    }

    /**
     * Extract content by section label 
     * @param {httpResponseBody} html 
     * @param {string} rowLabel 
     * @param {string} selector 
     * @param {string} attribute 
     * @returns {Array}
     */
    async extractDetailsByRowLabel(html, rowLabel, selector, attribute = null) {
        const $ = cheerio.load(html)
        const rows = $('.row');
        let hrefs = []

        rows.each(async (index, row) => {
            const sectionLabel = $(row).find('h2.section-label');
            if (sectionLabel.length > 0 && sectionLabel.text().trim() === rowLabel) {

                if (attribute) {
                    hrefs = $(row).find(selector).map((index, element) => $(element).attr(attribute)).get();
                } else {
                    hrefs = $(row).find(selector).map((index, element) => $(element).text().trim()).get();
                }

            }
        });
        return hrefs;
    }

    /**
     * Takes relatives, associates details and gives back json data. For example: relative1contact1: '', relative2name:'' and etc
     * @param {Array} relatives 
     * @param {Array} relativeNames 
     * @param {Array} associateNames 
     * @returns {object}
     */
    async crawlRelativesPhoneNumbers(relatives, relativeNames, associateNames = []) {
        let relativeUpdates = {}
        if (relatives.length) {
            const relativesSliced = relatives.slice(0, maximumRelativesToCrawl)
            await mapLimit(relativesSliced, async (relative, index) => {
                console.log(`Crawling Relative ${index}`)

                const relativeName = relativeNames[index];
                relativeUpdates[`relative${index}Name`] = relativeName;

                const associateName = associateNames[index];
                relativeUpdates[`associate${index}Name`] = associateName;

                relativeUpdates[`relative${index}URL`] = relative

                const { phoneNumbers } = await this.extractDetailsByUrl(relative)
                if (phoneNumbers.length) {
                    relativeUpdates = {
                        ...relativeUpdates,
                        ...generateUpdatesObject(phoneNumbers, `relative${index}Contact`),
                    }
                }
                sleep(20)
            }, maximumParallelLoops)
            return relativeUpdates
        }
    }

    /**
     * Checks if the next page button is disabled or not
     * @param {httpResponseBody} html 
     * @returns {boolean}
     */
    async checkIfNextPageExists(html) {

        const $ = cheerio.load(html)

        const paginationUl = $('ul.pagination');
        if (!paginationUl.length) {
            return false;
        }

        const lastLiElement = $('ul.pagination li').eq(-2)

        const isDisabled = lastLiElement.hasClass('disabled');
        if (!lastLiElement || isDisabled) return false;
        return true
    }

    /**
     * Returns total request count
     */
    async getRequestCount() {
        return this.requestCount
    }

    /**
     * Resets request count to 0
     */
    async resetRequestCount() {
        this.requestCount = 0
    }

    /**
     * Gets LLC name and tries to find onwer name
     * @param {string} name 
     */
    async getNameByLLC(name) {
        try {
            const postData = {
                "SEARCH_VALUE": name,
                "SEARCH_TYPE_ID": "1"
            };
            let firstName = '', lastName = ''
            const response = await this.axiosBizFileInstance.post('/api/Records/businesssearch', postData)
            const Agentdata = (Object.values(response.data.rows)[0])
            const id = Agentdata?.ID
            const ownerName = Agentdata?.AGENT

            if (ownerName) {
                const nameArray = ownerName?.split(" ")
                firstName = this.formatNamePart(nameArray[0])
                lastName = this.formatNamePart(nameArray[nameArray.length - 1])
            }
            return { firstName, lastName, fullName: ownerName, id }
        } catch (error) {
            console.error("Error getting owner name by LLC", error)
        }
    }

    /**
     * Returns formatted name
     * @param {string} namePart 
     * @returns 
     */
    formatNamePart(namePart) {
        return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }


    async askChatGPT(inputString) {
        const prompt = `From the following string, extract the first name and last name, response should only include the name no titles, no especial characters\n"${inputString}"`;

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', 
            messages: [
                { "role": "system", "content": "You are a naming knowledgable assitance, skilled in finding first and last name from given string" },
                { "role": "user", content: prompt }
            ],
        });
        const extractedNames = response.choices[0]?.message?.content?.split('\n')
        const firstName = extractedNames[0]?.split(':')[1]?.trim()
        const lastName = extractedNames[1]?.split(':')[1]?.trim()
        return { firstName, lastName };
    }


    /**
     * Call details API for bizfile to get mailing address, property address, city and states.
     * @param {number} id 
     * @returns {object}
     */
    async getLLCAgentAddressByID(id) {
        try {
            const response = await this.axiosBizFileInstance.get(`/api/FilingDetail/business/${id}/false`)
            const list = response.data.DRAWER_DETAIL_LIST
            // console.log(list)
            const mailingAddress = this.getValueByLabel(list, 'Mailing Address')
            const propertyAddress = this.getValueByLabel(list, 'Principal Address')

            const mailingAddressSplitarray = mailingAddress?.split('\n')
            const propertyAddressSplitarray = propertyAddress?.split('\n')

            const agentMailingAddress = {
                formattedMailingaddress: mailingAddressSplitarray[0].trim().replace(/#\d+/g, '')?.toLowerCase(),
                formattedMailingCity: mailingAddressSplitarray[1]?.split(',')[0]?.trim().toLowerCase(),
                formattedMailingState: mailingAddressSplitarray[1]?.split(',')[1]?.trim().replace(/[^a-zA-Z]/g, '')?.toLowerCase()
            }

            const agentPropertyAddress = {
                formattedMailingaddress: propertyAddressSplitarray[0].trim().replace(/#\d+/g, '')?.toLowerCase(),
                formattedMailingCity: mailingAddressSplitarray[1]?.split(',')[0]?.trim().toLowerCase(),
                formattedMailingState: mailingAddressSplitarray[1]?.split(',')[1]?.trim().replace(/[^a-zA-Z]/g, '')?.toLowerCase()
            }

            return { agentMailingAddress, agentPropertyAddress }
        } catch (error) {
            console.error("Error getting llc agent address by id", error)
        }
    }

    /**
     * From the array of key values data, function returns value of label we are interested in.
     * @param {array} data 
     * @param {string} label 
     * @returns {string}
     */
    getValueByLabel(data, label) {
        const foundItem = data.find(item => item.LABEL === label);

        if (foundItem) {
            return foundItem.VALUE;
        } else {
            return null;
        }
    }
     }


module.exports = Crawler
