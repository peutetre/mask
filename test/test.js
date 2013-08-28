/*
 * test.js
 */

var Mask = require('../lib/mask'),
    expect = require('expect.js'),
    err = function (s) { return function () { console.log(s); throw s; } };

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
                Mask.init({id:'blabla'});
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

            it('Mask.show must fail is the Mask is currently animated');
            it('Mask.hide must fail is the Mask is currently animated');

        });

        describe('Mask tap/click event handler', function () {
            it('Mask must call the event handler on tap/click events');
        });
    });

    setTimeout(function () {
        mocha.checkLeaks();
        mocha.run();
    }, 1000);
};
