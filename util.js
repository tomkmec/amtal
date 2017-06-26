let _ = require('underscore')

module.exports = {
	log: function(rampup, users) {
	  // var cr = process.platform.match(/win.*/) ? '\033[0G' : '\r';
	  // process.stdout.write(users + " users active" + cr);
	  console.log(users);
	},

	ms: function(hr2, hr1 = [0,0]) {
	  try {
	    return (( (hr2[0] * 1e9 + hr2[1]) - (hr1[0] * 1e9 + hr1[1]) )/1000000).toFixed(2)
	  } catch (e) {
	    return '?'
	  }
	},
	invert: function(map) {
    	var inverted = {};
    	_.each(map, 
    		(v1,k1) => _.each(v1, 
    			(v2,k2) => {
    				if (!inverted[k2]) inverted[k2] = {}; 
    				inverted[k2][k1] = v2;
    			})
    	);
    	return inverted;
	},
	formatTime: function(ms) {
		var d = new Date(ms);
		return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
			.map(num => (num<10?'0':'')+num)
			.join(':')
			.replace(/^00:/,'')
	},
	parseTime: function(time) {
		return time.split(':').map(s => parseFloat(s)).reduce((memo, val) => memo*60+val, 0)
	}
}