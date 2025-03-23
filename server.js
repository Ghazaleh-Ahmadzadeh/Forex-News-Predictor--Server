const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const routes = require("./routes.js");

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
