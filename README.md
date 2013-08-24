# Mask.js a dead simple mask

## Install

```
npm install mask
```

or the old school way

``` html
<script src="mask.js"></script>
```

# CI

TODO travis & saucelabs via jasmine ?

## API

### Mask.init(option)

Init the mask

``` javaScript
var Mask = require('mask');

// init the mask
Mask.init({
    // set background color
    backgroundColor:'rgba(34,25,123,0.5)',
    // set show/hide fade animation duration
    duration:500
});
```

### Mask.show() => promise[undefined]

Show the mask

``` javaScript
Mask.show().then(function () {
    // do something...
});
```

### Mask.hide() => promise[undefined]

Hide the mask

``` javaScript
Mask.hide().then(function () {
    // do something...
});
```

### Mask.onTouch()

Attach user action handler (touchstart/click)

``` javaScript
function myHandler(evt) {
    console.log("mask touched");
}

Mask.onTouch(myHandler);
```

### Mask.offTouch()

Remove action handler (touchstart/click)

``` javaScript
Mask.offTouch(myHandler);
```
