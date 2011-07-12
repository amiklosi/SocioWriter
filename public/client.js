var config = {minWordsToProceed:3};

function getArticle(id) {
	$.getJSON("/read/"+id,
		function(res){
			article = res;
			refreshText();
			$("#headerDiv").html(res.id);
			updateCandidateWords();
			repositionCandidates();
			$('#newParaButton').val("new paragraph ("+article.finishParagraphCounter+")");
		});
}

function refreshText() {
	$("#text").html(renderText(article.text)+" ");
	if (article.finished) {
		$('#finishTextButton').hide();
		$('#newParaButton').hide();
		$('#txt').hide();
	} else {
		$('#finishTextButton').show();
		$('#newParaButton').show();
		$('#txt').show();
	}
}

function repositionCandidates() {
	setTimeout(function() {
		var c= 0;
    	for(var p in article.words) if(article.words.hasOwnProperty(p))++c;
		if (c > 0) {
			$('#candidates').show();
			$('#candidates').position({
						of: $( "#txt" ),
						my: "center top",
						at: "center bottom",
						offset: "0"
					});
		} else {
			$('#candidates').hide();
		}

	}, 0);
}

function requestFinishParagraph() {
	$.getJSON("/finishParagraph/"+article.id);
}


$(this).ready(function() {
	$('#newParaButton').val("new paragraph ("+article.finishParagraphCounter+")");
	$('#newParaButton').click(requestFinishParagraph);
	$('#finishTextButton').val("finish text ("+article.finishTextCounter+")");
	$('#finishTextButton').click(function() {
		$.getJSON("/finishText/"+article.id);
	});
	$('#addButton').click(function() {
		$.getJSON("/newStory/"+$('#storyName').val());
		$('#storyName').val('');
	});
	$('#candidates').hide();
	repositionCandidates();
	$('#txt').focus();

	updateCandidateWords();
	refreshText();

});

$(window).resize(function() {
	repositionCandidates();
});

function submitForm(word) {
	$.getJSON("/write/"+article.id,
        word ? word : $('#txt').val(),
        function(res){
		});
    $('#txt').val('');
}

function requestWordsFrom(index) {
	$.getJSON("/getWords/"+article.id,
		{index: index},
        function(res){
			var i = index;
			for (var w in res.words)
				article.text[i++] = res.words[w];
			$("#text").html(renderText(article.text));
			article.wordPointer = res.pointer;
		}
	);
}

function updateCandidateWords() {
	var sw = [];
	for (var v in article.words) sw.push( v );
	sw.sort(function(a,b) {
		return (article.words[a] < article.words[b]) ? 1 : -1;
	});
	var s = "<table width='100%'>";
	for (var i=0; i<Math.min(sw.length, 10); i++) {
		s += "<tr id='w"+i+"' title='"+sw[i]+"' class='item'><td>"+sw[i] + "<td>("+article.words[sw[i]]+")";
	}
	s += "</table>";
	$("#candidates").html(s);
	for (var i=0; i<sw.length; i++) {
		$('#w'+i).click(function() { submitForm(this.title); });
	}
	repositionCandidates();
}

function init() {
	var socket = io.connect();

	socket.on('connect', function(socket) {
		console.log('socket connect '+socket);
	});

	socket.on('candidate', function(data) {
		if (data.articleId != article.id) return;
		article.words[data.word] = data.count;
		updateCandidateWords();
		lastSent = "";
	});

	socket.on('word', function(data) {
		if (data.articleId != article.id) return;
		if (data.pointer != article.wordPointer) {
			console.warn("Word pointers dont match. Server:"+data.pointer+" client: "+article.wordPointer);
			requestWordsFrom(article.wordPointer-1);
		} else {
			resetCounters();
			article.text[article.wordPointer++] = data.word;
			refreshText();
			repositionCandidates();
			$("#text").focus();
		}
	});

	socket.on('finishParagraphCounter', function(data) {
		console.log(data.articleId);
		if (data.articleId != article.id) return;
		$('#newParaButton').val("new paragraph ("+data.count+")");
	});

	socket.on('textFinished', function(data) {
		console.log(data.articleId);
		if (data.articleId != article.id) return;
		article.finished = true;
		refreshText();
	});

	socket.on('finishTextCounter', function(data) {
		console.log(data.articleId);
		if (data.articleId != article.id) return;
		$('#finishTextButton').val("finish text ("+data.count+")");
	});

	socket.on('newStory', function(data) {
		console.log(data.id);
		var id = "'"+data.id+"'";
		$('#storyList').append('<li><a href="javascript:getArticle('+id+')">'+data.id+'</a>');
	});

	socket.on('disconnect', function() {
		console.log("Socket disconnected");
	});
}

function resetCounters() {
	article.words = {};
	$("#candidates").text('');	
	repositionCandidates();
	updateCandidateWords();
}


