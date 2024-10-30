/* eslint-disable no-undef, no-console */
/* jslint browser: true */

"use strict";
$(document).ready(function(){
    console.log("jQuery работает, карусель инициализируется");

    $(".owl-carousel").owlCarousel({
        items: 1,
        loop: true,
        nav: true,
        dots: true
    });
});

