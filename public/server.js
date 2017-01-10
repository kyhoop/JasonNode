var async = require('async')
var waterfall = require('async-waterfall');
var parallel = require('async-parallel');
var express = require('express')
   , http = require('http')
   , path = require('path');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var app     = express();
var mssql = require('mssql');
var moment = require('moment');
var config = {
    user: 'jawebster',
    password: 'Khfsnv15!@#',
    server: 'jasonnode.database.windows.net',
    database: 'JasonNodeSQL',

    options: {
        encrypt: true // Use this if you're on Windows Azure 
    }
}
var Promise = require('i-promise'); //use whatever promise library you like
var cp = null;
var jobs = 0;
var actualJobs = 0;
var dtm = "";

function getConnection(){
  if (cp) return cp;
  return cp = new Promise(function(resolve,reject){
    var conn = new mssql.Connection(config, function(err){
      if (err){
        cp = null;
        return reject(err);
      }
      return resolve(conn);
    });
  });
}

function parseTeam(TeamName) {
    TeamName = TeamName.trim();
    if(TeamName[0] == '(') {
        TeamName = TeamName.substring(TeamName.indexOf(")") + 1);
        TeamName = TeamName.trim();
    }
    return TeamName;
}

function parseLine(Line) {
    Line = Line.trim();

    if(Line.indexOf('PK') == -1) {
        Line = Line.substring(0, Line.indexOf('\xa0'));
    }
    else {
        Line = "0";
    }

    var result = "";
    var result = Line.replace('½', '.5');

    return result;
}

function whosFavorite(Line1, Line2, Team1, Team2) {
    if(Line1 > Line2) {
        return Team1;
    }
    if(Line2 > Line1) {
        return Team2;
    }
    if (Line1 == Line2) {
        return "Pick"
    }
}

function whosUnderdog(Line1, Line2, Team1, Team2) {
    if(Line1 < Line2) {
        return Team1;
    }
    if(Line2 < Line1) {
        return Team2;
    }
    if (Line1 == Line2) {
        return "Pick"
    }
}

function checkGameTime(GameDate, GameTime) {     

        var tArray = GameTime.split(":");
        var hours = "00";
        var minutes = "00";
        var Locked = "";

        if(tArray[1].indexOf("p") > -1 && tArray[0] != "12") {
            hours = +tArray[0] + 12;
            minutes = tArray[1].replace("p", "");
        }
        if(tArray[1].indexOf("p") > -1 && tArray[0] == "12") {
            hours = +tArray[0];
            minutes = tArray[1].replace("p", "");
        }
        if(tArray[1].indexOf("a") > -1) {
            hours = +tArray[0];
            if(hours.length < 1)
            minutes = tArray[1].replace("a", "");
        }

        if(hours.length == 1) {
            hours = "0" + hours; 
        }
        if(minutes.length == 1) {
            minutes = "0" + minutes; 
        }

        var gDate = moment(GameDate.substring(0,4)+ '.' + GameDate.substring(4,6) + '.' + GameDate.substring(6,8) + ":" + hours + ":" + minutes, 'YYYY.MM.DD:hh:mm');

        var isStarted = moment().isBefore(gDate);

        
        if(isStarted) {
            Locked = "No";
            //console.log("The Game has NOT Started.  Gametime was: " + gDate.format("YYYYMMDD:hh:mm") + " compared to " + moment().format("YYYYMMDD:hh:mm"))
        }
        else {
           Locked = "Yes";
           //console.log("The Game has Started.  Gametime was: " + gDate.format("YYYYMMDD:hh:mm") + " compared to " + moment().format("YYYYMMDD:hh:mm"))
        }

        return Locked;
}

function checkLineUpdate(Team1, Team2, Team1Line, Team2Line, Favorite, Underdog, GameTime, GameDate, res) {
        
        var cp = getConnection();
        cp.then(
            function(conn){
                var sqlRequest = new mssql.Request(conn);
                sqlRequest.input('Team1', mssql.VarChar(255), Team1);
                sqlRequest.input('Team2', mssql.VarChar(255), Team2);
                sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                sqlRequest.input('GameTime', mssql.VarChar(255), GameTime);
                sqlRequest.query('select GameId, Locked from dbo.Lines where Team1 = @Team1 AND Team2 = @Team2 AND GameTime = @GameTime AND GameDate = @GameDate').then(function(recordset) {

                if (recordset.length > 0) {
                    console.log ("Updating Record: GameID = " + recordset[0].GameId);
                    var GameId = recordset[0].GameId;
                    updateLine(GameId, Team1, Team2, Team1Line, Team2Line, Favorite, Underdog, GameTime, GameDate, res)
                }
                else {
                    console.log ("Creating Record...");
                    createNewLine(Team1, Team2, Team1Line, Team2Line, Favorite, Underdog, GameTime, GameDate, res);
                }

                        
            },
            function(err){
            console.log('Error #1 ' + err);
            }
        )
        }).catch(function(err) {
            console.log('CP Error ' + err);
            return "Error";
        });

    return "No Idea";
}

function createNewLine(Team1, Team2, Team1Line, Team2Line, Favorite, Underdog, GameTime, GameDate, res) {
        console.log("TEAM 1 " + Team1)
        var Locked = checkGameTime(GameDate, GameTime);
        console.log(Locked)
        var cp = getConnection();
        cp.then(
            function(conn){
                var sqlRequest = new mssql.Request(conn);
                sqlRequest.input('Team1', mssql.VarChar(255), Team1);
                sqlRequest.input('Team2', mssql.VarChar(255), Team2);
                sqlRequest.input('Team1Line', mssql.VarChar(255), Team1Line);
                sqlRequest.input('Team2Line', mssql.VarChar(255), Team2Line);
                sqlRequest.input('Favorite', mssql.VarChar(255), Favorite);
                sqlRequest.input('Underdog', mssql.VarChar(255), Underdog);
                sqlRequest.input('GameTime', mssql.VarChar(255), GameTime);
                sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                sqlRequest.input('Locked', mssql.VarChar(255), Locked);
                sqlRequest.query('INSERT INTO dbo.Lines (Team1, Team2, TeamLine1, TeamLine2, Favorite, Underdog, GameDate, GameTime, Locked) VALUES (@Team1, @Team2, @Team1Line, @Team2Line, @Favorite, @Underdog, @GameDate, @GameTime, @Locked)').then(function(recordset) {

                console.log("Insert Success");
                jobs--;
                console.log("JOBS = " + jobs);
                if(jobs == 0) {
                            console.log("WE ARE DONE")
                            getGames(GameDate, res);
                        }
            },
            function(err){
            console.log('Error #1 ' + err);
            }
        )
        }).catch(function(err) {
            console.log('CP Error ' + err);
            return "Error";
        });
}

function updateLine(GameId, Team1, Team2, Team1Line, Team2Line, Favorite, Underdog, GameTime, GameDate, res) {
        console.log(GameDate + " " + GameTime);
        
        var Locked = checkGameTime(GameDate, GameTime);
        console.log(Locked)
        var cp = getConnection();
        cp.then(
            function(conn){
                var sqlRequest = new mssql.Request(conn);
                sqlRequest.input('Team1', mssql.VarChar(255), Team1);
                sqlRequest.input('Team2', mssql.VarChar(255), Team2);
                sqlRequest.input('Team1Line', mssql.VarChar(255), Team1Line);
                sqlRequest.input('Team2Line', mssql.VarChar(255), Team2Line);
                sqlRequest.input('Favorite', mssql.VarChar(255), Favorite);
                sqlRequest.input('Underdog', mssql.VarChar(255), Underdog);
                sqlRequest.input('GameTime', mssql.VarChar(255), GameTime);
                sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                sqlRequest.input('Locked', mssql.VarChar(255), Locked);
                sqlRequest.input('isLocked', mssql.VarChar(255), "No");
                sqlRequest.input('GameId', mssql.VarChar(255), GameId);
                sqlRequest.query('UPDATE dbo.Lines SET Team1 = @Team1, Team2 = @Team2, TeamLine1 = @Team1Line, TeamLine2 = @Team2Line, Favorite = @Favorite, Underdog = @Underdog, GameDate = @GameDate, GameTime = @GameTime, Locked = @Locked WHERE GameId = @GameId AND Locked = @isLocked').then(function(recordset) {

                console.log("Update Success");
                jobs--;
                console.log("JOBS = " + jobs);
                if(jobs == 0) {
                    console.log("WE ARE DONE")
                    getGames(GameDate, res);
                }

            },
            function(err){
            console.log('Error #1 ' + err);
            }
        )
        }).catch(function(err) {
            console.log('CP Error ' + err);
            return "Error";
        });
}

function makeSelection(lineID, User, Pick) {


}

function updateOutcome(LineID, outcome) {


}

function calculateWinner(Team1, Team2, GameTime, GameDate, Team1Score, Team2Score, Team1Line, Team2Line, Favorite, Underdog, res) {
    var UpdateorInsert = ""; 
    waterfall([
    function(callback){
        var ActualLine;
        
        var cp = getConnection();
        cp.then(
            function(conn){
                var sqlRequest = new mssql.Request(conn);
                sqlRequest.input('Team1', mssql.VarChar(255), Team1);
                sqlRequest.input('Team2', mssql.VarChar(255), Team2);
                sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                sqlRequest.input('GameTime', mssql.VarChar(255), GameTime);
                sqlRequest.query('select GameId, TeamLine1, Locked from dbo.Lines where Team1 = @Team1 AND Team2 = @Team2 AND GameTime = @GameTime AND GameDate = @GameDate').then(function(recordset) {

                        if (recordset.length > 0) {
                            console.log ("Line Returned for " + Team1 + " vs. " + Team2 + " is " + recordset[0].TeamLine1);
                            var GameId = recordset[0].GameId;
                            var ActualLine = recordset[0].TeamLine1;
                            var Locked = recordset[0].Locked;
                            console.log("Locked = " + Locked);
                            if(Locked != "Picked") {
                                Locked = "Yes";
                                Locked = checkGameTime(GameDate, GameTime);
                            }
                            UpdateorInsert = "Update";
                        }
                        else {
                            UpdateorInsert = "Insert";
                            Locked = "Yes";
                            Locked = checkGameTime(GameDate, GameTime);
                            ActualLine = Team1Line;
                        }

                         callback(null, ActualLine, GameId, Locked);
            },
            function(err){
            console.log('Error #1: ' + err);
            }
        )
        }).catch(function(err) {
            console.log('Error #2: ' + err);
            return "Error";
        });

       
    },
    function(ActualLine, GameId, Locked, callback){
        
        var whoCovered = "";
        var whoLost = "";
        var Team1AdjustedScore = +Team1Score + +ActualLine;
        var outcome = Team1AdjustedScore - Team2Score;
        
        if(outcome > 0) {
            //console.log(Team1 + " COVERED!!!");
            whoCovered = Team1;
            whoLost = Team2;

        }
        else if (outcome <0) {
            //console.log(Team2 + " COVERED!!!");
            whoCovered = Team2;
            whoLost = Team1;
        }
        else {
            whoCovered = "PUSH";
            whoLost = "PUSH";
        }
        callback(null, whoCovered, whoLost, GameId, Locked);
    },
    function(whoCovered, whoLost, GameId, Locked, callback){
        var cp = getConnection();
        console.log(Team1 + " " + Team2 + " " + GameDate + " " + GameTime + " " + Locked)
        cp.then(
            function(conn){
                if(UpdateorInsert == "Update") {
                    var sqlRequest = new mssql.Request(conn);
                    sqlRequest.input('Winner', mssql.VarChar(255), whoCovered);
                    sqlRequest.input('Loser', mssql.VarChar(255), whoLost);
                    sqlRequest.input('Team1Score', mssql.VarChar(255), Team1Score);
                    sqlRequest.input('Team2Score', mssql.VarChar(255), Team2Score);
                    sqlRequest.input('Locked', mssql.VarChar(255), Locked);
                    sqlRequest.input('GameId', mssql.VarChar(255), GameId);

                    sqlRequest.query('UPDATE dbo.Lines SET Winner = @Winner, Loser = @Loser, Team1Score = @Team1Score, Team2Score = @Team2Score, Locked = @Locked WHERE GameId = @GameId').then(function(recordset) {
                    
                    console.log ("----------START---------------");
                    console.log("Score Update Success");
                    

                        callback(null, 'done');
                    },
                    function(err){
                    console.log('Error #1 ' + err);
                    }
                )
            }
            if(UpdateorInsert == "Insert") {
                    var sqlRequest = new mssql.Request(conn);
                    sqlRequest.input('Team1', mssql.VarChar(255), Team1);
                    sqlRequest.input('Team2', mssql.VarChar(255), Team2);
                    sqlRequest.input('Team1Line', mssql.VarChar(255), Team1Line);
                    sqlRequest.input('Team2Line', mssql.VarChar(255), Team2Line);
                    sqlRequest.input('Favorite', mssql.VarChar(255), Favorite);
                    sqlRequest.input('Underdog', mssql.VarChar(255), Underdog);
                    sqlRequest.input('GameTime', mssql.VarChar(255), GameTime);
                    sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                    sqlRequest.input('Winner', mssql.VarChar(255), whoCovered);
                    sqlRequest.input('Loser', mssql.VarChar(255), whoLost);
                    sqlRequest.input('Team1Score', mssql.VarChar(255), Team1Score);
                    sqlRequest.input('Team2Score', mssql.VarChar(255), Team2Score);
                    sqlRequest.input('Locked', mssql.VarChar(255), Locked);
                    sqlRequest.query('INSERT INTO dbo.Lines (Team1, Team2, TeamLine1, TeamLine2, Favorite, Underdog, GameDate, GameTime, Winner, Loser, Team1Score, Team2Score, Locked) VALUES (@Team1, @Team2, @Team1Line, @Team2Line, @Favorite, @Underdog, @GameDate, @GameTime, @Winner, @Loser, @Team1Score, @Team2Score, @Locked)').then(function(recordset) {

                    
                    console.log ("----------START---------------");
                    console.log("Score Update Inserted");

                        callback(null, 'done', GameDate);
                    },
                    function(err){
                    console.log('Error #1 ' + err);
                    }
                )

            }
        }).catch(function(err) {
            console.log('CP Error ' + err);
            return "Error";
        });
      
    }
    ], function (err, result, GameDate) { 
        jobs--;
        console.log("JOBS INNER = " + jobs)
        console.log ("------------COMPLETE--------------");

        if(jobs == 0) {
            jobs = 1;
            var http = require('http')  
            var str = "";
            
            var options = "http://localhost:8081/scrapeLines?dtm=" + dtm;

            http.get(options, function (response) {  
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    res.send(str);
                });
                response.on('error', console.error)
            })
        }
        
        return "done";
    });
}

function getGames(dtm, res) {
     
     waterfall([
        function(callback){
            
            var ActualLine;
            var GameDate = dtm;

            var cp = getConnection();
            cp.then(
                function(conn){
                        var sqlRequest = new mssql.Request(conn);
                        sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                        sqlRequest.query('select * from dbo.Lines where GameDate = @GameDate ORDER BY GameTime ASC FOR JSON PATH').then(function(recordset) {
                        console.log("WE HAVE ARRIVED " + GameDate + "    " + recordset[0]["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"])
                        callback(null, recordset);
                    },
                    function(err){
                        console.log('SQL Error #1: ' + err);
                    }
                )
                }).catch(function(err) {
                    console.log('CP Error #2: ' + err);
                    return "Error";
                });
        
            },
            function(recordset, callback) {
                console.log(recordset[0]["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"]);
                res.send(recordset[0]["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"])
                res.end();
            },
            function(err){
                console.log('JSON Error #3: ' + err);
            }
    ])
}

function getPicks(res) {

     waterfall([
        function(callback){
            var cp = getConnection();
            cp.then(
                function(conn){
                        var sqlRequest = new mssql.Request(conn);
                        sqlRequest.query('select a.*, b.PickId, b.Outcome, b.[User], b.PickTime, b.TeamPicked from dbo.Lines a, dbo.Picks b where a.GameId = b.GameId ORDER BY GameDate DESC FOR JSON PATH').then(function(recordset) {

                        callback(null, recordset);
                    },
                    function(err){
                console.log('SQL Error #1: ' + err);
                }
            )
            }).catch(function(err) {
                console.log('CP Error #2: ' + err);
                return "Error";
            });
        },
        function(recordset, callback) {
            console.log(recordset[0]["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"]);
            res.send(recordset[0]["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"])
            res.end();
        },
        function(err){
            console.log('JSON Error #3: ' + err);
        }
    ])
}

function updateWinner(PickId, Outcome, res) {

    waterfall([
    function(callback){
        
        var cp = getConnection();
        cp.then(
            function(conn){
                var sqlRequest = new mssql.Request(conn);
                sqlRequest.input('PickId', mssql.VarChar(255), PickId);
                sqlRequest.input('Outcome', mssql.VarChar(255), Outcome);
                sqlRequest.query('UPDATE Picks SET Outcome = @Outcome WHERE PickId = @PickId').then(function(recordset) {

                jobs--;
                if(jobs == 0) {
                    getPicks(res);
                }

            },
            function(err){
            console.log('Error #1: ' + err);
            }
        )
        }).catch(function(err) {
            console.log('Error #2: ' + err);
            return "Error";
        });
    }
    ])
}

app.get('/scrapeLines', function(req, res){
    var dtm = "";
    dtm = req.query.dtm;

    url = 'http://www.sportsbookreview.com/betting-odds/ncaa-basketball/?date=' + dtm;

    request(url, function(error, response, html){

        if(!error){
            
            var $ = cheerio.load(html);

            var Team1 = "", Team2 = "", Team1Line = "", Team2Line="", Favorite = "", Underdog = "", GameTime = "", GameDate = "", Outcome = "";

            jobs = $('.holder-scheduled').length;
            if(jobs == 0) {
                    console.log("WE ARE DONE - Getting Lines")
                    getGames(dtm, res);
                }
            $('.holder-scheduled').each(function(){

                Team1 = parseTeam($(this).children().find('.eventLine-team').children().first().text());
                Team2 = parseTeam($(this).children().find('.eventLine-team').children().first().next().text());
                Team1Line = parseLine($(this).children().find('.eventLine-opener').children().first().text());
                Team2Line = parseLine($(this).children().find('.eventLine-opener').children().first().next().text());  
                Favorite = whosFavorite(Team1Line, Team2Line, Team1, Team2);  
                Underdog = whosUnderdog(Team1Line, Team2Line, Team1, Team2);
                GameTime = parseTeam($(this).children().find('.eventLine-time').children().first().text());  
                GameDate = dtm;
                
               console.log(Team1 + ' ~ ' + Team2 + ' ~ ' + Team1Line + ' ~ ' + Team2Line + ' ~ ' + Favorite + ' ~ ' + Underdog + ' ~ ' + GameTime + ' ~ ' + GameDate + ' ~ ' + Outcome);

               if(Team1Line != '') {
                    var lineExists = checkLineUpdate(Team1, Team2, Team1Line, Team2Line, Favorite, Underdog, GameTime, GameDate, res);
               }
               else {
                   console.log("Line is Blank for " + Team1 + " " + Team2)
                   jobs--;
               }
             });


        }
   })

   //res.send('Complete')
})

app.get('/scrapeScores', function(req, res){
    
    dtm = req.query.dtm;

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    url = 'http://www.sportsbookreview.com/betting-odds/ncaa-basketball/?date=' + dtm;

    request(url, function(error, response, html){

        if(!error){
            
                var $ = cheerio.load(html);

                var Team1 = "", Team2 = "", Team1Line = "", Team2Line="", Favorite = "", Underdog = "", GameTime = "", GameDate = "", Outcome = "", Winner = "", Loser = "", Locked = "Yes";
                var Team1Score;
                var Team2Score;
                var isFinal = "";

                jobs = $('.holder-complete').length;
                if(jobs == 0) 
                {
                    var http = require('http')  
                    var str = "";
                    
                    var options = "http://localhost:8081/scrapeLines?dtm=" + dtm;

                    http.get(options, function (response) {  
                        response.on('data', function (chunk) {
                            str += chunk;
                        });
                        response.on('end', function () {
                            res.send(str);
                        });
                        response.on('error', console.error)
                    })
                }
            
            console.log("Jobs Found = " + jobs);

            $('.holder-complete').each(function(){

                Team1 = parseTeam($(this).children().find('.eventLine-team').children().first().text());
                Team2 = parseTeam($(this).children().find('.eventLine-team').children().first().next().text());
                Team1Line = parseLine($(this).children().find('.eventLine-opener').children().first().text());
                Team2Line = parseLine($(this).children().find('.eventLine-opener').children().first().next().text());  
                Favorite = whosFavorite(Team1Line, Team2Line, Team1, Team2);  
                Underdog = whosUnderdog(Team1Line, Team2Line, Team1, Team2);
                GameTime = parseTeam($(this).children().find('.eventLine-time').children().first().text()); 
                isFinal = parseTeam($(this).children().find('.score-content').children().first().next().next().children().first().next().text());
                Team1Score = parseTeam($(this).children().find('.score-periods').children().first().text());
                Team2Score = parseTeam($(this).children().find('.score-periods').next().children().first().text());

                GameDate = dtm;
                
               if(isFinal == "FINAL") {
                    actualJobs++;
                    calculateWinner(Team1, Team2, GameTime, GameDate, Team1Score, Team2Score, Team1Line, Team2Line, Favorite, Underdog, res);
               }
               else {
                    actualJobs++;
                    console.log(Team1 + " vs. " + Team2 + " is Not Final")
               }

             });

        }
   })

   //res.send('Complete')
})

app.get('/getLines', function(req, res){ 
    jobs = 1;
    var dtm = "";
    dtm = req.query.dtm;

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    
    var http = require('http')  
    var str = "";
    
    var options = "http://localhost:8081/scrapeScores?dtm=" + dtm;

    http.get(options, function (response) {  
        response.on('data', function (chunk) {
            str += chunk;
        });
        response.on('end', function () {
            res.send(str);
        });
        response.on('error', console.error)
    })

    
})

app.get('/processPicks', function(req, res){ 
    jobs = 1;
    var dtm = "";
    dtm = req.query.dtm;

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    
    waterfall([
        function(callback){
            
            var ActualLine;
            var GameDate = dtm;

            var cp = getConnection();
            cp.then(
                function(conn){
                        var sqlRequest = new mssql.Request(conn);
                        sqlRequest.input('GameDate', mssql.VarChar(255), GameDate);
                        sqlRequest.query('select * from dbo.Lines a, dbo.picks b where a.GameId = b.GameId ORDER BY GameDate DESC').then(function(recordset) {

                            if (recordset.length > 0) {
                                jobs = recordset.length;
                                
                                for (i = 0; i < recordset.length; i++) {
                                    var Pick = recordset[i].TeamPicked;
                                    var Winner = recordset[i].Winner;
                                    var Loser = recordset[i].Loser;
                                    var User = recordset[i].User;
                                    var PickId = recordset[i].PickId;
                                    var Outcome = "";

                                    if(Winner == null) {
                                        Outcome = "Pending";
                                    }
                                    else if (Winner == Pick) {
                                        Outcome = "Win";
                                    }
                                    else if (Pick == Loser) {
                                        Outcome = "Loss";
                                    }
                                    else if (Winner == "PUSH") {
                                        Outcome = "Push";
                                    }

                                    updateWinner(PickId, Outcome, res);

                                    //console.log("User " + User + " Picked " + Pick + " and the outcome was a " + Outcome);
                                }
                            }
                            else {
                                
                            }
                        },
                        function(err){
                            console.log('SQL Error #1: ' + err);
                        }
                    )
                 }).catch(function(err) {
                    console.log('CP Error #2: ' + err);
                    return "Error";
                });
        
            },
            function(err){
                console.log('JSON Error #3: ' + err);
            }
        ])
})

app.get('/makePick', function(req, res){ 
    jobs = 1;
    var Team = req.query.Pick;
    var GameId = req.query.GameId;
    var User = req.query.UserId;
    var dtm = moment().format("YYYY-MM-DD hh:mm:ss");

    console.log(Team);
    console.log(GameId);
    console.log(User);
    console.log(dtm);


    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    

            var cp = getConnection();
            cp.then(
                function(conn){
                        var sqlRequest = new mssql.Request(conn);
                        sqlRequest.input('GameId', mssql.Int, GameId);
                        sqlRequest.input('PickDate', mssql.VarChar(255), dtm);
                        sqlRequest.input('Team', mssql.VarChar(255), Team);
                        sqlRequest.input('UserId', mssql.VarChar(255), User);
                        sqlRequest.query('INSERT INTO dbo.Picks ([User], TeamPicked, PickTime, GameId) VALUES (@UserId, @Team, @PickDate, @GameId)').then(function(recordset) {
                        
                        console.log("WE ARE DONE")

                        },
                        function(err){
                            console.log('SQL Error #1: ' + err);
                        }
                    )
                 }).catch(function(err) {
                    console.log('CP Error #2: ' + err.stack);
                    return "Error";
                });

    res.send("Success"); 
})

app.listen(8081, function () {
//exports = module.exports = app;
})