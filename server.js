const express = require('express');
const passport = require('./passport');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const MongoStore = require('connect-mongo');
const {fork} = require('child_process');
const minimist = require("minimist");
const advancedOptions = {useNewUrlParser: true, useUnifiedTopology: true};

const {options_mdb} = require('./options/mariaDB.js');
const {options} = require('./options/SQLite3.js');
const createTables = require('./createTables.js')

const { defaultConfiguration } = require('express/lib/application');
const { Server: HttpServer } = require('http');       
const { Server: SocketServer } = require('socket.io');

let producto = [];
let messages = [];

const app = express();
//app.use(express.urlencoded({extended: true}));
app.use(express.static('public')); 
app.use(cookieParser());

//Necesario para que funcione passport
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

let modulo = require('./Contenedor.js');
let contenedor_prod = new modulo.Contenedor('productos', options_mdb);
let contenedor_mnsjs = new modulo.Contenedor('mensajes', options);

const httpServer = new HttpServer(app);             
const socketServer = new SocketServer(httpServer);  
const argv = minimist(process.argv.slice(2), {alias: {"p": "port"}})

let credencial = {};

//------------------ SET SESSION -----------------------

app.use(session({

    /* store: MongoStore.create({
        mongoUrl: 'mongodb+srv://MartinLozada:Martin36240@cluster0.qbjj5ql.mongodb.net/?retryWrites=true&w=majority',
        mongoOptions: advancedOptions
      }), */
    secret: 'clave',
    resave: true,
    cookie: {
        maxAge: 600000
      },
    saveUninitialized: true
  }));

app.use(passport.initialize());
app.use(passport.session());

//--------- RENDER LOGIN, REGISTER Y LOGOUT ---------------

const {engine} = require('express-handlebars');

app.set('view engine', 'hbs');
app.set('views', './views');

app.engine(
    'hbs',
    engine({
        extname: '.hbs'
    })
);

app.get('/', (req, res) => {
    res.render('login');
});
app.post('/', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
})

app.post('/register', passport.authenticate('registracion'), (req, res) => {
    
    console.log("registrado correctamente");
    res.redirect('/')
})

app.post('/login', passport.authenticate('autenticacion'), (req, res) => {
    
    console.log("autenticado correctamente");
    credencial = {name: req.body.username};
    res.sendFile('index.html', { root: __dirname });
});


app.get('/logout', (req, res) => {

    req.session.destroy((err) =>{
        if(!err) res.render('logout', { credencial });
        else res.send({status: 'Logout ERROR', body: err})
    })
});

/*---------------- RUTAS NUMEROS RANDOM E INFO -------------- */

app.get('/api/randoms/', (req, res) => {
    let cantDatos = parseInt(req.query.cant);
    const forked = fork('randomNumbers');

    forked.on('message', numbers => {
        res.send(numbers);
    })
    forked.send(cantDatos);
    console.log("random succesful")
});

app.get('/info', (req, res) =>{
    const info = {
        args: argv,
        sistema: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage.rss(),
        path: process.cwd(),
        processId: process.pid,
        file: __dirname
    }
    
    res.send(info)
})

//----------------------------------------------------------------

socketServer.on('connection', (socket) => {

    async function init(){
        await createTables();
        messages = await contenedor_mnsjs.getAll();
        producto = await contenedor_prod.getAll();
        socket.emit('new_event', producto, messages, credencial);      
    }
    init();

    socket.on('nuevo_prod', (obj) => {

        async function ejecutarSaveShow(argObj) {
            await contenedor_prod.save(argObj);
            const result = await contenedor_prod.getAll();
            producto = result;
            socketServer.sockets.emit('new_event', producto, messages, credencial);
        }
        ejecutarSaveShow(obj);
    });
    socket.on('new_message', (mensaje) => {
        async function ejecutarSaveShowMnsjs(mnsj) {
            await contenedor_mnsjs.save(mnsj);
            const result = await contenedor_mnsjs.getAll();
            messages = result;
            socketServer.sockets.emit('new_event', producto, messages, credencial);
        }
        ejecutarSaveShowMnsjs(mensaje);
    });
});

httpServer.listen(8080, () => {
  console.log('Estoy escuchando en el puerto 8080');
});
