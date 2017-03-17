// ***** schedule this whole thing *****

// NightmareJS for the spider construction
var Nightmare = require('nightmare');       
var nightmare = Nightmare({ show: true });

// SQLite3 for the database
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('fbo.db');

// SendMail for emailing the updates
var sendmail = require('sendmail')();

// For writing the HTML files
var fs = require('fs');

// MongoDB for the database
var MongoClient = require('mongodb').MongoClient;


// Using this to do the cron work since I don't want to mess with cron in Linux and this is more portable
//var CronJob = require('cron').CronJob;

// Set up the console stamp
require( "console-stamp" )( console, {
    metadata: function () {
        return ("[" + (process.memoryUsage().rss  / 1000000).toFixed(2) + " MB] " + (new Error).lineNumber);
    },
    colors: {
        stamp:    "yellow",
        label:    "red",
        metadata: "green"
    }
} );

var i = 0;
process.argv.forEach(function(arg) {
  console.log(i++, arg);
})

//var serverAddress = '10.201.40.178';
var serverAddress = 'http://arc-fbobot.utdallas.edu:8080';

var templateFile = 'index.template';

process.argv[2] == 'server' ? templateFile = 'file:///home/fborobo/fbo-mailer-bot/' + templateFile : templateFile = 'file:///home/scottshotgg/Development/fbo-mailer-bot/' + templateFile;

console.log(templateFile);
 
if (process.argv[6] != undefined && process.argv[6].length > 0) {
  emailList.push(process.argv[6]);
  console.log(emailList);
}

var specialMessageAddition = '';
if (process.argv[4].length > 0) {
  specialMessageAddition = '<div style="width: 700px;"><b><h3>Announcement:</h3></b>' + process.argv[4] + '</div><br><br><br>';
}

var forceEmailSend = parseInt(process.argv[5]) || 0;

var columns       = ['Title', 'BAA', 'Agency', 'Date', 'Link'];
var attributeList = ['Title', 'BAA', 'Classification', 'Agency', 'Office', 'Location', 'Type', 'Date', 'Link', 'File'];

var columnIndexs = columns.map(function(column) {
  return attributeList.indexOf(column);
});

var parentElements = [];
var parentElementsInnerText = [];

var lastMongoID = 0;


// Small client class
class Client {
  constructor(name, email, checkList) {
    this.Name = name;
    this.Email = email;
    this.SearchCriteria = checkList;
    // this should probably reference a root dir 
    (name == '') ? (this.Path = '') : (this.Path = 'clients/' + name + '/');
  }
}

// Store this stuff in a DB table
var clients = [''];
var emails = ['scg104020@utdallas.edu'];
if (process.argv[3] == "deploy") {
   emails = ['arc@lists.utdallas.edu'];
}
console.log(emails);

var checkList = [['A -- Research & Development', '541712 -- Research and Development in the Physical, Engineering, and Life Sciences (except Biotechnology)', 'Combined Synopsis/Solicitation']];

// Make the clientMap using the stuff from the DB
var clientMap = clients.map(function(client, index) {
  return new Client(client, emails[index], checkList[index]);
});

function sendEmail(email, html, length) {
  sendmail({
    from: 'FBO-Mailer-Bot',
    //to: emailList.map(email => email + '@utdallas.edu'), 
    to: email,
    subject: length + ' NEW FBO Opportunities Found - ' + getDateInfo().join('/'),
    html: html
  },  
    function(err, reply) {
      console.log(err && err.stack);
      console.dir(reply);
    }
  );
}


function createLink(link, text) {
  return '<a href="' + link + '">' + text + '</a>'
}


function makeTableRowHTML(row) {
  var returnString;

  if (!Array.isArray(row)) {
    var returnString = '<tr><td><center>' + createLink(row.Link, row.Title) + '</center></td>' + [row.BAA, row.Agency, row.Date].map(function(data) {
      return '<td><center>' + data + '</center></td>';
    }).join('') + '</tr>';

  } else {
    var returnString = '<tr><td><center>' + createLink(row[row.length - 1], row[0]) + '</center></td>' + columnIndexs.slice(1, columnIndexs.length - 1).map(function(index) {
      return '<td><center>' + row[index] + '</center></td>';
    }).join('') + '</tr>';
    console.log(returnString);
  }

  return returnString;
} 


function getDateInfo(date) {
  var d;
  if(date == undefined) {
    d = new Date();
  } else {
    d = new Date(date);
  }

  return [d.getMonth() + 1, d.getDate(), d.getFullYear()];
}


function getAttributes() {
  parentElements = [].slice.call(document.getElementsByClassName('input-checkbox'))
  parentElementsInnerText = parentElements.map(element => element.labels[0].innerText);
}


function checkAttribute(name) {
  // Try to change this to be subString
  parentElements[parentElementsInnerText.indexOf(name)].checked = true;
}


function pressSubmitButton() {
  document.getElementsByName('dnf_opt_submit')[1].click();
}


function createFile(filePath, html) {
  fs.writeFile(filePath, html, (err) => {
      if(err) {
      return console.log(err);
    }

    console.log('******' + filePath + 'was saved!');
  });
}


function makeDir(path) {
  console.log(path);
  console.log('path ' + path);
  if (!fs.existsSync(path)) {
      fs.mkdir(path, (err, folder) => {
      if (err) throw err;
        console.log("Created folder", folder);
    });
  }
}


function createCSVFile(path, rows) {
  //Write FBODatabase.csv file
  var csvString = rows.map(row => Object.values(row).map(value => '"' + value + '"').join(','));
  console.log(csvString);

  fs.writeFile(path + "FBODatabase.csv", (['DB ID'].concat(attributeList).join(',')).toString() + '\n' + csvString.join('\n')), (err) => {
      if(err) {
        return console.log(err);
    }
    console.log(" ****** FBODatabase.csv was saved!");
  };
}


function injectHTML(template, rows, client) {
  db.serialize(function() {
    var rowsLength = rows.length;
    // Extract entire database
    db.all('select * from fbodata', function(err, rows) {
      createCSVFile(client.Path, rows); 

      var completeRowsHTML = rows.reverse().map(makeTableRowHTML);

      var tableColumns = columns.slice(0, columns.length - 1);
      var tableHeader = tableColumns.slice(0, tableColumns.length - 1).map(header => '<th>' + header + '</th>').join('\n') + '\n<th style="min-width: 120px;">' + tableColumns[tableColumns.length - 1] + '</th>';
      var filePath = (client.Name == '' ? '' : 'clients/' + client.Name + '/');

      var nn = new Nightmare()
        .goto(template)
        .evaluate(function(template, completeRowsHTML, tableHeader, client, rowsLength) {
          var filePath = client.Path;

          // Inject index.html elements
          $('thead')[0].innerHTML = tableHeader;
          $('tbody')[0].innerHTML = completeRowsHTML.join('');
          $('#search_parameters')[0].innerHTML = client.SearchCriteria.map((ele, index) => (index + 1) + '. ' + ele).join('<br>');
          $('#date')[0].innerHTML = 'Generated on ' + (new Date());
          // might need to change some file stuff here
          $('#download')[0].href = 'http://arc-fbobot.utdallas.edu:8080/' + filePath + 'FBODatabase.csv';
          indexHTML = $('html')[0].outerHTML;

          // Inject email.html elements
          $('#download')[0].href = 'http://arc-fbobot.utdallas.edu:8080/' + filePath + 'index.html';
          $('#download')[0].innerText = 'View and Download the full database';
          $('tbody')[0].innerHTML = completeRowsHTML.splice(0, rowsLength).join('');
          emailHTML = $('html')[0].outerHTML;

          return {'Index': indexHTML, 'Email': emailHTML};
        }, template, completeRowsHTML, tableHeader, client, rowsLength)
        .end()
        .then(function(html) {
          createFile(filePath + 'index.html', html.Index);
          createFile(filePath + 'email.html', html.Email);
          sendEmail(client.Email, html.Email, rowsLength);
        });
    });
  });
}


function scrapeFBOData(client) {
  console.log('\n\n' + new Date() + '\n\n');

  console.log("client:", client);
  
  // might be able to use another instance to alleviate the repetitive fetching of the checkboxes
  var nightmare = new Nightmare({ show: true })
    .goto('https://www.fbo.gov/index?s=opportunity&tab=search&mode=list')
    .evaluate(function(client) {
      parentElements = [].slice.call(document.getElementsByClassName('input-checkbox'))
      parentElementsInnerText = parentElements.map(element => element.labels[0].innerText);

      client.SearchCriteria.forEach(function(attr) {
        parentElements[parentElementsInnerText.indexOf(attr)].checked = true;
      });

      document.getElementsByName('dnf_opt_submit')[1].click();
    }, client)
    .wait('.list')
    .evaluate(function(attributeList) {
      return Array.prototype.slice.call(document.getElementsByClassName('lst-rw')).map(
        function(row) {
          return Object.assign(...(row.innerText.split(/[\n\t]/).concat(row.cells[0].firstElementChild.href).map(
            function(item, index) {
              return {[attributeList[index]]: item};
            }
          )));
          //return row.innerText.split(/[\n\t]/).concat(row.cells[0].firstElementChild.href);
        }
      )
    }, attributeList)
    .end()
    .then(function(data) {
      data.reverse().forEach(function(row, index) {
        row.ID = lastMongoID + index + 1;
        //row._id = row.BAA;
        mongoDBEmitter.emit('insert', row);
      });
    })
    /*
    .then(function(data) {

      //insertMongoDB(data);
      //console.log(data);
      

      //return;

      var stmt = db.prepare("insert into fbodata (Title, BAA, Classification, Agency, Office, Location, Type, Date, Link) values (?, ?, ?, ?, ?, ?, ?, ?, ?)");

      var tableLength = 0;
      var rows = new Array();
      var lastID = 1;

      db.serialize(function() {
        //data.map(function(item, index, htmlString) {
          data.reverse().map(function(piece) {
          //for (var piece of data) {
            stmt.run(piece, function(error) {
              //console.log("htmlString: ", htmlString);
              console.log("stmt.run error:", error);
              //console.log(data[this.lastID - 1]);
              if(error == null) {
                //console.log(rows);
                rows.push(piece);
                tableLength += 1
                lastID = this.lastID;
              }
            });
        });

        stmt.finalize(function() {
          if(tableLength > 0 || forceEmailSend == 1) {
            injectHTML(templateFile, rows, client);
          } else {
            console.log("\n\nNothing new scraped, nothing new to see. :(");
          }
        });

        db.close();
      })
    })
    .catch(function (error) {
      console.error('Search failed:', error);
    });
    */
}


/* ===================  THIS IS THE CODE YOU ARE LOOKING FOR  =================== */
/* ===================  THIS IS WHERE EVERYTHING STARTS       =================== */


/*
db.serialize(function() {
  db.run("create table fbodata (ID integer primary key, Title text not null, BAA text not null unique, Classification text, Agency text, Office text, Location text, Type text, Date text, Link text, File string)", function(error) {
       console.log("Table Creation Error:", error);
   });
  db.run("create table clients (ID integer primary key, Name text not null, Email text not null unique, SearchCriteria text )", function(error) {
       console.log("Table Creation Error:", error);
   });
});

makeDir('clients/complete');
*/
//connectMongoDB();


var fbodataCollection;
var mongo;

const EventEmitter = require('events');
class DBEmitter extends EventEmitter {}
const mongoDBEmitter = new DBEmitter();

mongoDBEmitter.on('insert', (row) => {
  insertMongoDB(row);
});


function connectMongoDB() {
  // Connect to the db    
  MongoClient.connect("mongodb://localhost:27017/fbo-mailer", function(err, mdb) {
      if(!err) {
        console.log('Connected');
        mongo = mdb;
        createCollection();
      } else {
        console.log(err);
      }
    });
}


function insertMongoDB(row) {
  //getNextSequence('userid', row);
  console.log(row);
  fbodataCollection.insert(row, function(err, object) {
    if(err) {
      console.log('error!', err);
    }
  });
}

function createCollection() {
  console.log('We are connected');

  mongo.collection('counters').insert(
    { _id: "userid",
      seq: 0 }, 
      function(err, records) {
    }
  );

  fbodataCollection = mongo.collection('fbodata');
  fbodataCollection.createIndex({'BAA': 1}, {unique: true});

  getLastMongoID();
}

function getLastMongoID() {
  fbodataCollection.find({}).sort({'ID': -1}).limit(1).next().then(function(value) {
    lastMongoID = value.ID;
  });
}


function getNextSequence(name, row) {
   var ret = mongo.collection('counters').findAndModify(
          { _id: name },
          undefined,
          { $inc: { seq: 1 } },
          function(err, object) {
            if(!err) {
              row.ID = object.value.seq;
              console.log(row);
              fbodataCollection.insert(row);
            }
          }
   );
}

connectMongoDB();



clientMap.forEach(function(client) {
  if(client.Path != '') {
    makeDir(client.Path);
  }
  
  // we really need to make a producer consumer thing
  scrapeFBOData(client);
});
