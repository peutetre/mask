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

    function is(val, rst, errRaison) {
        return function (elt) {
            if (val === rst) return elt;
            else throw new Error(errRaison);
        };
    }

    function Zopacityf(visible, d) {
        return Zanimo.transitionf('opacity', visible ? 1 : 0, d, 'ease-in-out');
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
            backgroundColor : 'rgba(1,1,1,.5)',
            zIndex : 10
        },
        duration = 500,
        initialized = false,
        displayed = false,
        animated = false,
        transitionf = Zopacityf,
        el = null;

        Mask.init = function (config) {
            if (initialized) return;
            el = window.document.createElement('div');

            if (config) {
                if (config.id) el.id = config.id;
                if (config.backgroundColor)
                    defaultStyle.backgroundColor = config.backgroundColor;
                if (config.duration) duration = config.duration;
                if (config.transitionf) transitionf = config.transitionf;
                if ("zIndex" in config) defaultStyle.zIndex = config.zIndex;
            }

            setDefaultStyle(el, defaultStyle);
            window.document.body.appendChild(el);
            initialized = true;
        };

        Mask.style = function (style) { setDefaultStyle(el, style); };

        Mask.show = function () {
            if(!initialized) return Q.reject("Mask is not initialized!");
            return Zanimo(el)
                .then(is(animated, false, "Mask is in use!"))
                .then(is(displayed, false, "Mask is already displayed!"))
                .then(function (el) { animated = true; return el; })
                .then(setStyle('display', 'block'))
                .then(transitionf(true, duration))
                .then(function (el) {
                    displayed = true;
                    el.addEventListener(inputEvent, Mask.f);
                    animated = false;
                    return el;
                });
        };

        Mask.hide = function () {
            if(!initialized) return Q.reject("Mask is not initialized!");
            return Zanimo(el)
                .then(is(animated, false, "Mask is in use!"))
                .then(is(displayed, true, "Mask is already hidden!"))
                .then(function (el) { animated = true; return el; })
                .then(transitionf(false, duration))
                .then(setStyle('display', 'none'))
                .then(function (el) {
                    el.removeEventListener(inputEvent, Mask.f);
                    displayed = false;
                    animated = false;
                    return el;
                });
        };

        Mask.onTouch = function(f) { Mask.f = f; };

        return Mask;
});
