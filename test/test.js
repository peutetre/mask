/*
 * test.js
 */

var Mask = require('../lib/mask'),
    expect = require('expect.js'),
    Q = require('q'),
    err = function (s) { return function (err) { console.log(s, err.message); throw new Error(s, err); } };

onload = function () {
    describe('Mask', function () {

        describe('Mask initialisation', function () {
            it('window.Mask must be an object', function () {
                expect(Mask).to.be.an(Object);
            });

            it('Mask.show() should fail when the mask is not initialized', function (done) {
                Mask.show().then(err("Mask should fail!"), function (err) {
                    var f = function () { throw err; }
                    expect(f).to.throwException(/Mask is not initialized!/);
                    done();
                });
            });

            it('Mask.hide() should fail when the mask is not initialized', function (done) {
                Mask.hide().then(err("Mask should fail!"), function (err) {
                    var f = function () { throw err; }
                    expect(f).to.throwException(/Mask is not initialized!/);
                    done();
                });
            });

            it('Mask should have a underlying DOM element after being init()', function () {
                Mask.init({id:'blabla'/*, duration:1000 */});
                expect(window.document.getElementById('blabla')).to.be.a(HTMLElement);
            });
        });

        describe('Mask show/hide', function () {
            it('on Mask.show(), the mask should be displayed with non zero opacity after calling show()', function (done) {
                Mask.show().then(function (el) {
                    expect(el.style.display).to.match(/block/);
                    expect(el.style.opacity).to.be.greaterThan(0);
                    done();
                }, err("Mask should fail!"));
            });

            it('Mask should be hidden with  zero opacity after the calling hide()', function (done) {
                Mask.hide().then(function (el) {
                    expect(el.style.display).to.match(/none/);
                    expect(el.style.opacity).to.eql(0);
                    done();
                }, err("Mask should fail!"));
            });

            it('Mask.hide must fail is the Mask is currently animated', function (done) {
                Q.all([
                    Mask.show(),
                    Q.delay(100).then(function () {
                        Mask.hide().then(err("Mask should fail!"), function (err) {
                            var f = function () { throw err; };
                            expect(f).to.throwException(/Mask is in use!/);
                        });
                    })
                ]).then(function () { done(); }, err("Mask should fail!"));
            });

            it('Mask.show must fail is the Mask is currently animated', function (done) {
                Q.all([
                    Mask.hide(),
                    Q.delay(100).then(function () {
                        Mask.show().then(err("Mask should fail!"), function (err) {
                            var f = function () { throw err; };
                            expect(f).to.throwException(/Mask is in use!/);
                        });
                    })
                ]).then(function () { done(); }, err("Mask should fail!"));
            });
        });

        describe('Mask tap/click event handler', function () {
            it('Mask must call the event handler on tap/click events', function (done) {
                this.timeout(5000);
                Mask.onTouch(function () {
                    Mask.hide().then(function () { done(); }, function () { done(); });
                });
                Mask.show().then(function () {
                    setTimeout(function () {
                        var evt = document.createEvent("MouseEvents");
                        evt.initMouseEvent(
                            window.document.ontouchstart === null ? "touchstart" : "click",
                            true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null
                        );
                        document.getElementById('blabla').dispatchEvent(evt);
                    }, 100);
                }, err("Mask should fail!"));
            });
        });


        describe('Mask.style({ /* some css style */ })', function () {
            it('Mask.style({ zIndex:200 }) must set the z-index to `200`', function () {
                Mask.style({ zIndex:200 });
                expect(parseInt(document.getElementById('blabla').style.zIndex, 10)).to.be(200);
            });
        });
    });

    setTimeout(function () {
        //mocha.checkLeaks();
        mocha.run();
    }, 1000);
};
