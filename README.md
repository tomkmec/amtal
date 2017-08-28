# Amtal

> To know a thing well, know its limits. Only when pushed beyond its tolerances will true nature be seen. – The Amtal Rule

Simple load testing tool done out of sheer desperation to load test [Sapho](http://sapho.com) (Yes, we're Frank Herbert's Dune enthusiasts).

Aimed at easy scripting of real-world API usage

## Basic Usage
```javascript
    let amtal = require('amtal');

    let scenario = user =>
        Promise.resolve()
        // Sequential requests with tink time in between:
        .then(user.POST("Submit Login","/api/login", {user: "tom", "password": "123"})) // POST, PUT: request name, path, data [, options]
        .then(user.wait(2))
        .then(user.GET("Get Main Data", "/api/data"), {processResponse: true}) // GET: request name, path [, options]
        // Parallel requests
        .then(response => Promise.all(
            JSON.parse(response.body).links.map(link => 
                user.GET("Get " + link.name, link.url)())));

    let configuration = {
        host: "api.acme.com"
    };

    let rampup = { 
        0: 0, // minute => number of running users
        '1:30': 5, // or 'h:m:s' => number of running users
        2: 5,
        5: 50,
        10: 50
    }
    
    amtal
        .run(scenario, configuration, rampup)
        .then(amtal.exportResults({dir:"results"}))
```

## Promises Cookbook

* Start with `Proimise.resolve()`.
* Chain synchronous requests with `.then(user.METHOD(...)).then(user.METHOD(...))`.
* To process response syncronously, set the `processResponse` option to `true` and chain `.then(data => new Promise((resolve, reject) => { /* work with data (raw response)*/; resolve(); }))`
* To fire parallel requests (and wait for all to complete), do `.then(() => Promise.all([user.GET(...)(), user.POST(...)()]))` - notice the METHOD functions are executed here! You're chaining a function returning a promise of array, not array of promises! 
* To add a result processing in the parallel part, instead of single `user.GET(...)()`, do `Promise.resolve().then(user.METHOD(...)).then(data => new Promise((resolve, reject) => {}))` - same as the top level promise chain

## User Context

The user instance holds a context hash (`user.context`) that can be used to store values and use them in path interpolation.

To use the context values in path interpolation, use `${this.foo}` in second (path) argument of user.METHOD shortcut methods. `${this.foo}` will be resolved to value of `user.context.foo` when the request is initiated.