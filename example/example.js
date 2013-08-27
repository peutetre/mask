var Qstart = require('qstart'),
    Q = require('q'),
    Mask = require('../lib/mask');

function main() {
    Mask.init();

    var btn = window.document.getElementById("btn1"),
        log = function (s) { return function () { console.log(s); } },
        err = function (s) { return function (err) { console.log(s + " " + err); } };

    btn.addEventListener('touchstart', function (evt) {
        Mask.show().then(log("Mask displayed"), err("Oops show,"));
    });

    function touchAction(evt) {
        Mask.hide().then(log("Mask hidden"), err("Oops hide,"));
    }

    Mask.onTouch(touchAction);
}

Qstart.then(main);
