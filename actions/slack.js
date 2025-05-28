// slackNotifier.js
const axios = require('axios');

const slackWebhookUrl = "https://hooks.slack.com/services/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";

/**
 * Envía un mensaje predefinido a un webhook de Slack
 */
function notifySlack(response) {
  const message = {
    text: response || "Mensaje predeterminado",
  };

  axios.post(slackWebhookUrl, message)
    .then(() => {
      console.log("Mensaje enviado a Slack con éxito.");
    })
    .catch((error) => {
      console.error("Error al enviar el mensaje a Slack:", error);
    });
}

module.exports = { notifySlack };