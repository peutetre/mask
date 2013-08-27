module.exports = function(grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        connect: {
            server: {
                options: {
                    base: "",
                    port: 9999
                }
            }
        },
        watch: {
            all: {
                files: ['src/mask.js', 'test/test.js'],
                tasks: ['default']
            }
        },
        jshint: {
            all: {
                src: ['src/mask.js', 'test/test.js']
            }
        },
        'saucelabs-mocha': {
            all: {
                options: {
                    urls: ["http://localhost:9999/test/index.html"],
                    tunnelTimeout: 5,
                    build: (new Date()).getTime(),
                    concurrency: 3,
                    browsers: grunt.file.readJSON('browsers.json').browsers,
                    testname: "mask tests",
                    tags: ["master"]
                }
            }
        }
    });

    grunt.loadNpmTasks("grunt-contrib-connect");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-saucelabs");

    grunt.registerTask("dev", ["connect", "watch"]);
    grunt.registerTask("test-sauce", ["connect", "saucelabs-mocha"]);
    grunt.registerTask('default', ['jshint']);
};
