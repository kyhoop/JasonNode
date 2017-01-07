var express = require('express');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var app     = express();

app.get('/scrape', function(req, res){
    url = 'http://www.vegasinsider.com/college-basketball/matchups/matchups.cfm/date/12-27-16';

    // The structure of our request call
    // The first parameter is our URL
    // The callback function takes 3 parameters, an error, response status code and the html

    request(url, function(error, response, html){
        //res.send("Hello World\n");

        // First we'll check to make sure no errors occurred when making the request
        console.log('Function Called');

        if(!error){
            console.log('Function Called - No Error');
            // Next, we'll utilize the cheerio library on the returned html which will essentially give us jQuery functionality
            var $ = cheerio.load(html);
            // Finally, we'll define the variables we're going to capture

            var Team1, Team2, Line, Favorite, Underdog, GameTime, GameDate, Outcome;
            var json = { Team1 : "", Team2 : "", Favorite : "", Underdog : "", GameTime : "", GameDate : "", Outcome : ""};

            $('.viHeaderNorm').each(function() {
                console.log('Data Found...');
                console.log($(this).text());
            });

            //$('.header').filter(function(){
              //  var data = $(this);
               // title = data.children().first().text();
               // json.Team1 = "";
            //})
        }
   })

   res.send('Complete')
})

app.listen(8081, function () {
console.log('Magic happens on port 8081');
//exports = module.exports = app;
})