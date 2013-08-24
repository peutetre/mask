var Qstart = require('qstart'),
    Q = require('q'),
    Mask = require('mask');

function main() {
    Mask.init({
        debug:true
    });

    /*Mask.show().then(function () {
        console.log('Mask is displayed');
    });

    function onMaskTouch(mask, evt) {
        console.log("onMaskTouch");
        mask.hide(function () {
            //Mask.offTouch(onMaskTouch)
            console.log("Mask is hidden");
        });
    }*/

    //Q.delay(1000).then(Mask.hide);

    Mask.show()
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show)
        .then(Mask.hide)
        .then(Mask.show);
    window.mask = Mask;

    //Mask.onTouch(onMaskTouch);
}

Qstart.then(main);
