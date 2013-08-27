/*
 * test.js
 */

var Mask = require('../lib/mask'),
    expect = require('expect.js');

exports.def =  function () {
    describe('Mask', function () {
        describe('Mask should be an object', function () {
            it('window.Mask must be an object', function () {
                expect(Mask).to.be.an(Object);
            });
        });
        describe('Mask initialisation', function () {
            it('Mask should have a underlying DOM element after being init()', function () {
                Mask.init({id:'blabla'});
                expect(window.document.getElementById('blabla')).to.be.a(HTMLElement);
            });
        });
    });
};
