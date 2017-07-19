let User = require('./User.js')
  , util = require('./util.js')
  , _ = require('underscore')

class TestContext {
  constructor(scenario, configuration, rampup) {
    this.scenario = scenario;
    this.configuration = configuration;
    this.rampup = rampup;
    this.requests = [];
    this.users = [];

    this.rampupArray = _.chain(rampup).pairs().map(pair => [parseFloat(pair[0]), pair[1]]).value();
    this.userFn = ms => {
      var s = ms/1000;
      var min = s / 60;
      for (var i=0; i<this.rampupArray.length-1; i++) {
        if (this.rampupArray[i][0] <= min && this.rampupArray[i+1][0] > min) {
          return Math.floor(this.rampupArray[i][1] 
            + (this.rampupArray[i+1][1]-this.rampupArray[i][1])
              * ((min-this.rampupArray[i][0])/(this.rampupArray[i+1][0]-this.rampupArray[i][0])))
        }
      }
      return -1;
    };
  }

  run() {
    this.startTime = Date.now();

    var interval = setInterval(() => {
      var time = Date.now() - this.startTime;
      var desiredUsers = this.userFn(time);
      util.log(time, this)
      if (desiredUsers > this.users.length) {
        this.startUser(this.users.length + 1, this.scenario);
      } else if (desiredUsers == -1) {
        clearInterval(interval);
      }
    }, 1000)

    return new Promise((resolve) => this.finalResoluton = resolve);
  }

  startUser(number, scenario) {
    var user = new User(number, this);
    this.users.push(user);

    this.runOrDestroy(user, scenario);
  }

  runOrDestroy(user, scenario) {
    if (this.users.length <= this.userFn(Date.now() - this.startTime)) {
      user.reinit();
      scenario(user)
        .then(() => this.runOrDestroy(user, scenario))
        .catch(error => {
          console.log(`Error while running scenario for user #${user.num}: ${error}`);
          this.runOrDestroy(user, scenario)
        });
    } else {
      user.destroy(); 
      this.users = _.without(this.users, user);
      util.log(Date.now() - this.startTime, this, true)
      if (this.users.length == 0) {
        this.finalResoluton(this);
      }
    }
  }  

}

module.exports = TestContext;