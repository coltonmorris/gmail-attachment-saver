let express = require('express')

let app = express()


app.get('/',function (req,res) {
	res.send('hello world')
})

app.listen(8080,function() {
	console.log('Listening on port 8080')
})
