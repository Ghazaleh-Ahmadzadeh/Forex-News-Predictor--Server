const express = require("express");
const router = express.Router();
const controller = require("./controller/controller.js");

router.get("/api/currentRate", controller.getCurrentRate);
router.get("/api/week", controller.getWeekData);
router.get("/api/30days", controller.get30DaysData);
router.get("/api/90days", controller.get90DaysData);
router.get("/api/news", controller.getNews);
router.get("/api/prediction", controller.getPrediction);
router.get("/api/updateRate", controller.updateRate);

module.exports = router;
