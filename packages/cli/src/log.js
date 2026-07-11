'use strict';

// const Jetty = require("jetty");
// const jetty = new Jetty(process.stdout);


const log = function (data) {
    // jetty.clear();
    // jetty.moveTo([0, 0]);
    // jetty.text(data.toString());

    console.clear()
    console.log(data.toString());
};

module.exports = log;