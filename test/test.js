/*
 * test.js
 */

describe('Mask', function () {
    describe('Mask initialisation', function () {
        it('Mask should have a underlying DOM element after being init()', function () {
            Mask.init({id:'blabla'});
            expect(window.document.getElementById('blabla')).to.be.a(HTMLElement);
        });
    });
});
