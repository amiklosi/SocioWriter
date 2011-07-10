var http = require('http');
var sio = require('socket.io');
var express = require('express');
var fs = require('fs');
var render = require('./public/render.js');


var mongo = require('mongoskin');
var db = mongo.db("localhost:27017/SocioWriterDB");

var app = express.createServer();

var config = {minWordsToProceed: 3, neededToFinishParagraph: 5, neededToFinishText: 10};

function stripText(article) {
	var res = new Article();
	for (var k in article)
		res[k] = article[k];
	res.text = "";
	return res;
}

function sendMessage(articleId, message, data) {
	data.articleId = articleId;
	io.sockets.emit(message, data);
}

function Article(idString) {
    this.id = idString;
	this.text = [];
	this.finishParagraphCounter = 0;
	this.finishTextCounter = 0;
	this.words = {};
	this.wordPointer = 0;
	this.finished = false;
};

var articles = {};

app.configure(function() {
    app.set('views', __dirname + '/views');
    app.use(express.static(__dirname + '/public'));
});

app.get('/:id?', 
	function(req, res) {

		var id = req.params.id;
        if (!id) id = 0;
		var article = articles[id];
		if (!article) {
			article = articles['Rules'];
		}
		console.log("Getting "+id+" from "+req.connection.remoteAddress+":"+req.connection.remotePort);
		var ids = [];
		for (var aid in articles) ids.push(aid);
		res.render('index.jade', {article: article, text: render.renderText(article.text), ids: ids});
	});

app.get('/read/:id', function(req, res) {
	var id = req.params.id;
	if (!id || !articles[id]) {
        res.send('{error: "no article found"}');
        return;
    }
    article = articles[id];
	res.send(JSON.stringify(article));
});

app.get('/finishParagraph/:id?', function(req, res) {
	var id = req.params.id;
	if (!id || !articles[id]) {
		res.send('{error: "no article found"}');
		return;
	}
	article = articles[id];
	article.finishParagraphCounter++;
	if (article.finishParagraphCounter >= config.neededToFinishParagraph) {
		writeWord(id, "<br/>",config.minWordsToProceed);
		article.finishParagraphCounter = 0;
	}
	sendMessage(id, "finishParagraphCounter", {count: article.finishParagraphCounter});
	res.send('{}');
	db.collection('stories').save(article);
});

app.get('/finishText/:id?', function(req, res) {
	var id = req.params.id;
	if (!id || !articles[id]) {
		res.send('{error: "no article found"}');
		return;
	}
	article = articles[id];
	article.finishTextCounter++;
	if (article.finishTextCounter >= config.neededToFinishText) {
		article.finished = true;
		article.words = {};
		article.finishTextCounter = 0;
	}
	sendMessage(id, "finishTextCounter", {count: article.finishTextCounter});
	res.send('{}');
	db.collection('stories').save(article);
});

app.get('/write/:id?', function(req, res) {
    var id = req.params.id;
	if (!id || !articles[id]) {
        res.send('{error: "no article found"}');
        return;
    }
    var article = articles[id];

    for (var v in req.query) {
		if (/[^a-zA-Z0-9 ']/g.test(v) && ['.',',','!','?'].indexOf(v) < 0) return;
		if (['.','?','!'].indexOf(v)>=0 && article.wordPointer == 0) continue;
		writeWord(id, v, 1);
	}
	res.send('{}');
});

app.get('/getWords/:id?', function(req, res) {
	var id = req.params.id;
	if (!id || !articles[id]) {
		res.send('{error: "no article found"}');
		return;
	}
	article = articles[id];
	var words = [];
	for (var i = req.query.index; i<article.text.length; i++)
		words.push(article.text[i]);
	res.send(JSON.stringify({words: words, pointer: article.wordPointer}));
});

app.get('/newStory/:name?', function(req, res) {
	var id = req.params.name;
	if (/[^a-zA-Z ']/g.test(id)) return;
	if (!id || articles[id]) {
		res.send('{error: "article exists"}');
		return;
	}
	var article = new Article(id);
	articles[id] = article;
	db.collection('stories').save(article);
	res.send({});
	sendMessage(id, "newStory", {id: id});
});

app.get('/deleteStory/:id?', function(req, res) {
	var id = req.params.id;
	if (!id || !articles[id]) {
		res.send('{error: "article doesnt exists"}');
		return;
	}
	db.collection('stories').remove({id: id});
	delete articles[id];
	res.send({});
	sendMessage(id, "removeStory", {id: id});
});

app.get('/cleanStory/:id?', function(req, res) {
	var id = req.params.id;
	if (!id || !articles[id]) {
		res.send('{error: "article doesnt exists"}');
		return;
	}
	var article = articles[id];
	article.text = [];
	article.words = {};
	article.wordPointer = 0;
	article.finished = false;
	article.finishParagraphCounter = 0;
	article.finishTextCounter = 0;
	db.collection('stories').save(article);
	res.send({});
});

function writeWord(articleId, word, num) {

	var article = articles[articleId];

	if (article.finished) return;

	if (article.words[word]) {
		article.words[word]+=num;
	} else {
		article.words[word] = num;
	}
	if (article.words[word] < config.minWordsToProceed) {
		sendMessage(article.id, "candidate", {word:word, count: article.words[word]});
	}
	for (var w in article.words) {
		if (article.words[w] >= config.minWordsToProceed) {
			if (article.wordPointer == 0 || ['.','!','?'].indexOf(article.text[article.wordPointer-1])>=0) {
				w = w.charAt(0).toUpperCase() + w.substring(1);
			}
			sendMessage(articleId, "word", {word: w, pointer: article.wordPointer});
			article.text[article.wordPointer++] = w;
			article.words = {};
		}
	}
	db.collection('stories').save(article);
}



app.listen(process.argv.length > 2 ? process.argv[2] : 4000, process.argv.length > 3 ? process.argv[3] : "127.0.0.1");

db.collection('stories').find({}).each(function(err, res) {
	if (res && res.id != 'Rules') {
		articles[res.id] = res;
	}
});

db.collection('stories').find({id:'Robots'}).toArray(function(err, res) {
	if (res && res.length > 0) {
		console.log('Database found, loading stories');
	} else {
		db.createCollection('stories', function(err, data) {
			if (err) {
				console.error("Can't create collection");
			}
			db.collection('stories').insert(new Article('Playground'), function(err, data) {
				articles['Playground'] = data[0];
				console.log(data);

			});
			db.collection('stories').insert(new Article('Robots'), function(err, data) {
				articles['Robots'] = data[0]	;
				console.log(data);
			});
		});

	}
});

var io = sio.listen(app);

var words = [];
fs.readFile(__dirname+"/words.txt", "utf-8", function(err, data) {
	if (err) {
		console.error("Could not read words.txt");
		return;
	}
	words = data.split(" ");
	setInterval(function() {
		var num = 0;
		for (var a in articles) {
			num++;
		}
		if (Math.random() > 0.5) {
			writeWord("Robots", words[Math.round(Math.random()*words.length)], 1);
		}
	}, 10000);
});

fs.readFile(__dirname+"/rules.txt", "utf-8", function(err, data) {
	if (err) {
		console.error("Could not read rules.txt");
		return;
	}
	rules = data.split(" ");
	articles['Rules'] = new Article('Rules');
	articles['Rules'].text = rules;
	articles['Rules'].finished = true;
});


console.log(__dirname);

io.set('transports', [
    'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
]);

io.set('log level', 1);
io.enable('browser client minification');
io.enable('browser client etag');


