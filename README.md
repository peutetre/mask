# Mask.js a dead simple mask

a simple mask for the modern browser.

## Install

with browserify and npm:

```
npm install mask
```

# Example

demo: http://peutetre.github.io/mask/example/

# Test [![Build Status](https://secure.travis-ci.org/peutetre/mask.png)](http://travis-ci.org/peutetre/mask) [![Dependency Status](https://gemnasium.com/peutetre/mask.png)](https://gemnasium.com/peutetre/mask)

test runner: http://peutetre.github.io/mask/test/

[![SauceLabs Status](https://saucelabs.com/browser-matrix/mask.svg)](https://saucelabs.com/u/mask)

# Build tests and example

```
npm install
npm run build
```

open a browser at `test/index.html`

## API

### Mask.init(option) => DOMElement

Init the mask and return the created `<div>`

``` javaScript
var Mask = require('mask');

// init the mask
Mask.init({
    // set background color (optional)
    backgroundColor:'rgba(34,25,123,0.5)',
    // set show/hide fade animation duration (optional)
    duration:500
});
```

### Mask.style(option)

style the underlying element

``` javaScript
Mask.style({
    zIndex : 200
});
```

### Mask.show() => promise[DOMElement]

Show the mask

``` javaScript
Mask.show()
    .then(function (el) {
        // do something...
    }, function (err) {
        console.log(err);
        // occurs when the mask is already displayed
        // or when the mask is in transition.
    });
```

### Mask.hide() => promise[DOMElement]

Hide the mask

``` javaScript
Mask.hide()
    .then(function (el) {
        // do something...
    }, function (err) {
        console.log(err);
        // occurs when the mask is already hidden
        // or when the mask is in transition.
    });
});
```

### Mask.onTouch(f)

Set the touchstart/click event handler

``` javaScript
function myHandler(evt) {
    console.log("mask touched");
}

Mask.onTouch(myHandler);
```

## ChangeLog

### v0.2.0
    * upgrade to q 1.0.x
    * upgrade to zanimo 1.0.x
    * rm qanimationframe dependency

### v0.1.7
    * Clean npm package by adding a .npmignore
    * Remove package.json from example and test folder

### v0.1.6
    * Fix race condition on Mask show/hide operations.

### v0.1.5
    * Make Mask working on IE8.
    * Add QanimationFrame dep.

### v0.1.4
    * using opacity & opaque background for not breaking in IE8.

### v0.1.3
    * add the possibility to override the zIndex.

### v0.1.2
    * add the possibility to override the transition function.

### v0.1.1
    * add Mask.style()
