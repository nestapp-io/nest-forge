const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  const sandboxPath = path.join(
    context.appOutDir,
    "chrome-sandbox"
  );
  if (fs.existsSync(sandboxPath)) {
    console.log("Corrigindo permissões do chrome-sandbox...");
    fs.chmodSync(sandboxPath, 0o4755); // equivalente a chmod 4755
  }
};