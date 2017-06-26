# Amtal

> To know a thing well, know its limits. Only when pushed beyond its tolerances will true nature be seen. – The Amtal Rule

Simple load testing tool done out of sheer desperation to load test [Sapho](http://sapho.com) (Yes, we're Frank Herbert's Dune enthusiasts).

Aimed at easy scripting of real-world API usage

## Basic Usage
```
    let amtal = require('amtal');

    let scenario = user =>
        Promise.resolve()
        // Sequential requests with tink time in between:
        .then(user.POST("Sbmit Login","/api/login", {user: "tom", "password": "123"}))
        .then(user.wait(2))
        .then(user.GET("Get Main Data", "/api/data"))
        // Parallel requests
        .then(response => Promise.all(
            JSON.parse(response.body).links.map(link => 
                user.GET("Get " + link.name, link.url))));

    let configuration = {
        host: "api.acme.com"
    };

    let rampup = { // minute => number of running users
        0: 0,
        1: 5,
        2: 5,
        5: 50,
        10: 50
    }
    
    amtal.run(scenario, configuration, rampup)
        .then(amtal.exportResults({dir:"results"}))
```