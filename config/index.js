// config/index.js

const columnMappings = {
  // — Datos “básicos” del propietario
  address:            0,   // “Address” está en la columna A (índice 0)
  unitNumber:         1,   // “Unit #” está en la columna B (índice 1) — si lo necesitas
  city:               2,   // “City” está en la columna C (índice 2)
  state:              3,   // “State” está en la columna D (índice 3)
  zip:                4,   // “Zip” está en la columna E (índice 4)
  county:            5,   // “County” (si lo usas) está en la columna F (índice 5)
  apn:               6,   // “APN” (si lo usas) está en la columna G (índice 6)

  ownerOccupied:     7,   // “Owner Occupied” en la columna H (índice 7) — si lo necesitas
  ownerOneFirstName: 8,   // “Owner 1 First Name” en la columna I (índice 8)
  ownerOneLastName:  9,   // “Owner 1 Last Name” en la columna J (índice 9)
  ownerTwoFirstName:10,   // “Owner 2 First Name” en la columna K (índice 10)
  ownerTwoLastName: 11,   // “Owner 2 Last Name” en la columna L (índice 11)

  // Mailing:  
  // “Mailing Care of Name” está en M (índice 12) — si lo necesitas
  mailingAddress:   13,   // “Mailing Address” en la columna N (índice 13)
  mailingUnitNumber:14,   // “Mailing Unit #” en la columna O (índice 14) — si lo necesitas
  mailingCity:      15,   // “Mailing City” en la columna P (índice 15)
  mailingState:     16,   // “Mailing State” en la columna Q (índice 16)
  mailingZip:       17,   // “Mailing Zip” si existe (índice 17) — ajústalo si no coincide

  // … aquí van el resto de columnas intermedias que NO usamos directamente …

  // ——————————————————————————————————————————————————
  // A partir de la columna 41 “Owner MOBILE 1”, vienen estos campos:
  ownerMobile1:     41,  // “Owner MOBILE 1” en la columna AN (índice 41)
  ownerMobile1Type: 42,  // “Owner MOBILE 1 TYPE” en la columna AO (índice 42)
  ownerMobile2:     43,  // “Owner MOBILE 2” en AP (índice 43)
  ownerMobile2Type: 44,  // “Owner MOBILE 2 TYPE” en AQ (índice 44)
  ownerMobile3:     45,  // “Owner MOBILE 3” en AR (índice 45)
  ownerMobile3Type: 46,  // “Owner MOBILE 3 TYPE” en AS (índice 46)
  ownerMobile4:     47,  // “Owner MOBILE 4” en AT (índice 47)
  ownerMobile4Type: 48,  // “Owner MOBILE 4 TYPE” en AU (índice 48)
  ownerMobile5:     49,  // “Owner MOBILE 5” en AV (índice 49)
  ownerMobile5Type: 50,  // “Owner MOBILE 5 TYPE” en AW (índice 50)
  ownerMobile6:     51,  // “Owner MOBILE 6” en AX (índice 51)
  ownerMobile6Type: 52,  // “Owner MOBILE 6 TYPE” en AY (índice 52)
  ownerMobile7:     53,  // “Owner MOBILE 7” en AZ (índice 53)
  ownerMobile7Type: 54,  // “Owner MOBILE 7 TYPE” en BA (índice 54)

  // Si hay columnas de Landline previas en tu CSV, ignóralas o mapea si las vas a usar:
  // ownerLandline1:   55,  // “Owner LANDLINE 1” (índice 55)
  // ownerLandline2:   56,  // “Owner LANDLINE 2” (índice 56)
  // … etc.

  // ——————————————————————————————————————————————————
  // Parientes: “Relative N Full Name” y “Relative N Mobile M”
  // En este CSV la fila cero (indices) es la cabecera; la parte de “Relative 1 Full Name” 
  // está en el índice 60 aproximadamente, pero como tu CSV usa nombres largos, 
  // sólo mapearemos si los usamos en el código:

  relative1Name:    60,  // “Relative 1 Full Name” en columna BJ (índice 60)
  relative1Contact1:69,  // “Relative 1 Mobile 1” en columna BR (índice 69)
  relative1Contact2:70,
  relative1Contact3:71,
  relative1Contact4:72,
  relative1Contact5:73,

  relative2Name:    74,  // “Relative 2 Full Name” en columna BT (índice 74)
  relative2Contact1:75,
  relative2Contact2:76,
  relative2Contact3:77,
  relative2Contact4:78,
  relative2Contact5:79,

  relative3Name:    80,  // “Relative 3 Full Name” en BU (índice 80)
  relative3Contact1:81,
  relative3Contact2:82,
  relative3Contact3:83,
  relative3Contact4:84,
  relative3Contact5:85,

  relative4Name:    86,  // “Relative 4 Full Name” en BV (índice 86)
  relative4Contact1:87,
  relative4Contact2:88,
  relative4Contact3:89,
  relative4Contact4:90,
  relative4Contact5:91,

  relative5Name:    92,  // “Relative 5 Full Name” en BW (índice 92)
  relative5Contact1:93,
  relative5Contact2:94,
  relative5Contact3:95,
  relative5Contact4:96,
  relative5Contact5:97,

  // ——————————————————————————————————————————————————
  // Emails (tu CSV tiene “Email”, “Email 1”, “Email 2”, “Email 3”…)
  emailAll:  98,  // "Email" en la columna BX (índice 98) — si quieres guardarlo
  email1:    99,  // “Email 1” en columna BY (índice 99)
  email2:   100,  // “Email 2” en columna BZ (índice 100)
  email3:   101   // “Email 3” en columna CA (índice 101)
};

const maximumParallelLoops = 10;
const maximumRelativesToCrawl = 5; // tu CSV llega hasta Relative 5

module.exports = { columnMappings, maximumParallelLoops, maximumRelativesToCrawl };