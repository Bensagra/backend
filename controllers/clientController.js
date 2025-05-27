const methods = require("./crudController");
require("../../models/Admin");
require("../../models/Client");
require("../../models/Product");
require("../../models/Lead");
require("../../models/ProcessCSV");
module.exports = methods.crudController("Client");
