require('./test').def();

onload = function () {
  setTimeout(function () {
      mocha.checkLeaks();
      mocha.run();
  }, 2000);
};
