/**
 * mask.js - a dead simple mask
 */

(function (definition) {
    if (typeof exports === "object") {
        module.exports = definition();
    } else {
        Mask = definition();
    }

})(function () {

    function setDefaultStyle(el, style) {
        for (var attr in style) el.style[attr] = style[attr];
    }

    function setStyle(attr, val) {
        return function (el) {
            var d = Q.defer();
            window.requestAnimationFrame(function () {
                el.style[attr] = val; d.resolve(el);
            });
            return d.promise;
        };
    }

    function is(val, rst) {
        return function (elt) {
            if (val === rst) return elt;
            else Q.reject("is fn: not equal");
        };
    }

    function Zopacityf(v, d) {
        return Zanimo.transitionf('opacity', v, d, 'ease-in-out');
    }

    var Q = window.Q || require('q'),
        Zanimo = window.Zanimo || require('zanimo'),
        inputEvent = window.document.ontouchstart === null ? "touchstart": "click",
        Mask = {},
        defaultStyle = {
            width : '100%',
            height : '100%',
            position : 'absolute',
            top : 0,
            left : 0,
            opacity : 0,
            display : 'none',
            backgroundColor : 'rgba(1,1,1,.5)'
        },
        duration = 500,
        initialized = false,
        displayed = false,
        el = null;

        Mask.init = function (config) {
            if (initialized) return;
            el = window.document.createElement('div');

            if (config && config.id) el.id = config.id;
            if (config && config.backgroundColor)
                defaultStyle.backgroundColor = config.backgroundColor;
            if (config && config.duration) duration = config.duration;

            setDefaultStyle(el, defaultStyle);
            window.document.body.appendChild(el);
            initialized = true;
        };

        Mask.show = function () {
            return Zanimo(el)
                .then(is(displayed, false))
                .then(setStyle('display', 'block'))
                .then(Zopacityf(1, duration))
                .then(function () { return  displayed = true, el; });
        };

        Mask.hide = function () {
            return Zanimo(el)
                .then(is(displayed, true))
                .then(Zopacityf(0, duration))
                .then(setStyle('display', 'none'))
                .then(function () { return displayed = false, el; });
        };

        Mask.onTouch = function(f) { el.addEventListener(inputEvent, f); };
        Mask.offTouch = function() { el.removeEventListener(inputEvent, f); };

        return Mask;
});
