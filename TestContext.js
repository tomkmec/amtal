let User = require('./User.js')
  , util = require('./util.js')
  , _ = require('underscore')

class TestContext {
  constructor(scenarios, configuration, rampup) {
    this.scenarios = scenarios;
    this.rampup = rampup;
    if (!_.isArray(this.rampup)) this.rampup = [this.rampup];
    if (!_.isArray(this.scenarios)) this.scenarios = [this.scenarios];

    if (this.rampup.length != this.scenarios.length) {
      console.log(`${this.scenarios.length} scenarios provided, but rampup has ${this.rampup.length} elements!`);
      process.exit(1);
    }

    this.configuration = configuration;
    this.requests = [];
    this.users = _.map(new Array(this.rampup.length), x => []);

    this.rampupArray = _.map(this.rampup, scenario => _.chain(scenario).pairs().map(pair => [util.parseTime(pair[0])/60, pair[1]]).sortBy(parir => parir[0]).value());
    this.userFn = ms => {
      var s = ms/1000;
      var min = s / 60;
      var result = _.map(this.rampupArray, rampupElement => {
        for (var i=0; i<rampupElement.length-1; i++) {
          if (rampupElement[i][0] <= min && rampupElement[i+1][0] > min) {
            return Math.floor(rampupElement[i][1] 
              + (rampupElement[i+1][1]-rampupElement[i][1])
                * ((min-rampupElement[i][0])/(rampupElement[i+1][0]-rampupElement[i][0])))
          }
        }
      })
      return _.max(result) > -1 ? result : -1;
    };
  }

  run() {
    this.startTime = Date.now();

    var interval = setInterval(() => {
      var time = Date.now() - this.startTime;
      var desiredUsers = this.userFn(time);
      util.log(time, this)
      if (desiredUsers === -1) {
        clearInterval(interval);
      } else {
        _.each(desiredUsers, (desiredForScenario, i) => { 
          if (desiredForScenario > this.users[i].length) {
            this.startUser(i, this.users[i].length + 1, this.scenarios[i]);
          } 
        });
      }
    }, 1000)

    return new Promise((resolve) => this.finalResoluton = resolve);
  }

  startUser(scenarioNumber, number, scenario) {
    var user = new User(number, this);
    this.users[scenarioNumber].push(user);

    this.runOrDestroy(scenarioNumber, user, scenario);
  }

  runOrDestroy(scenarioNumber, user, scenario) {
    if (this.users[scenarioNumber].length <= this.userFn(Date.now() - this.startTime)[scenarioNumber]) {
      user.reinit();
      scenario(user)
        .then(() => this.runOrDestroy(scenarioNumber, user, scenario))
        .catch((error) => {
          console.log(`Error while running scenario #${scenarioNumber} for user #${user.num}: ${error.stack}`);
          this.runOrDestroy(scenarioNumber, user, scenario)
        });
    } else {
      user.destroy(); 
      this.users[scenarioNumber] = _.without(this.users[scenarioNumber], user);
      util.log(Date.now() - this.startTime, this, true)
      if (this.userFn(Date.now() - this.startTime) === -1 && _.flatten(this.users).length == 0) {
        this.finalResoluton(this);
      }
    }
  }  

}

module.exports = TestContext;