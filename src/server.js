const firebase = require('firebase-admin');
const cors = require('cors');
const corsOptions = {
    origin: 'https://cloud.botfree.com.br',
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200
}

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express');
const bodyParser = require('body-parser');
const GNRequest = require('./apis/gerencianet');
const serviceAccount = require("./services/bot-cloud.json");

const app = express();

app.use(bodyParser.json());
app.use(cors(corsOptions));
app.set('view engine', 'ejs');
app.set('views', 'src/views');

const setCob = async (data) => {
    if (!firebase.apps.length) {
        firebase.initializeApp({
            credential: firebase.credential.cert(serviceAccount)
        });
    } else {
        firebase.app(); // if already initialized, use that one
    }

    const db = firebase.firestore()
    await db.collection('pix').doc(data.txid).set(data)
}

app.post('/', async (req, res) => {

    const reqGNAlready = GNRequest({
        clientID: process.env.GN_CLIENT_ID,
        clientSecret: process.env.GN_CLIENT_SECRET
    });
    console.log(req.body)
    const reqGN = await reqGNAlready;
    const {
        userID,
        texto,
        valorCob,
        produto
    } = req.body

    const dataCob = {
        calendario: {
            expiracao: 3600
        },
        valor: {
            original: valorCob.toFixed(2).toString()
        },
        chave: '32a81632-d662-4e00-b854-4a2427f181be',
        solicitacaoPagador: texto
    };

    const cobResponse = await reqGN.post('/v2/cob', dataCob);
    const qrcodeResponse = await reqGN.get(`/v2/loc/${cobResponse.data.loc.id}/qrcode`);

    await setCob({
        userID,
        txid: cobResponse.data.txid,
        status: cobResponse.data.status,
        produto,
        texto
    })
    res.send({
        txid: cobResponse.data.txid, 
        imagemQrcode: qrcodeResponse.data.imagemQrcode,
        qrcode: qrcodeResponse.data.qrcode
    })
});

app.post('/webhook(/pix)?', (req, res) => {
    console.log(req.body)
    if (!firebase.apps.length) {
        firebase.initializeApp({
            credential: firebase.credential.cert(serviceAccount)
        });
    } else {
        firebase.app(); // if already initialized, use that one
    }

    const db = firebase.firestore()
    req.body.pix.forEach(async pix => {
        const results = await db.collection('pix').doc(pix.txid).get()
        if (results.exists) {
            await db.collection('pix').doc(pix.txid).update({ status: 'PAGO' })
            const data1 = results.data()
            const userData = await db.collection('users').doc(data1.userID).get()
            if (userData.exists) {
                const data = userData.data()
                const refund = pix.hasOwnProperty('devolucoes') ? true : false
                const validity = calcularData(data.userBot.validity, data1.texto, refund)
                
                let data_user = {}
                if(data.userBot.hasOwnProperty('chat_id')){
                    data_user = {
                        chat_id: data.userBot.chat_id,
                        validity,
                        tested: true
                    }
                }else{
                    data_user = {
                        validity,
                        tested: true
                    }
                }

                await db.collection('users').doc(data1.userID).update({
                    userBot: (data_user)
                })
            }
        }
    })

    res.send('200');
});

const calcularData = (validade, texto, refund) => {
    const now = new Date();
    const past = new Date(validade.seconds * 1000)
    const diff = past.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    let validity = null
    let dayRenew = 30

    if (refund){
        now.setDate(now.getDate() - 1)
        return now
    }

    if (texto == '1 Mês de VIP') {
        dayRenew = 30
    } else if (texto == '3 Meses com 10% de desconto') {
        dayRenew = 90
    } else if (texto == '6 Meses com 20% de desconto') {
        dayRenew = 180
    } else {
        dayRenew = 30
    }

    if (days > 0) {
        past.setDate(past.getDate() + dayRenew)
        validity = past
    } else {
        now.setDate(now.getDate() + dayRenew)
        validity = now
    }

    return validity
}

/*app.get('/attdatauser', async (req, res) => {
    if (!firebase.apps.length) {
        firebase.initializeApp({
            credential: firebase.credential.cert(serviceAccount)
        });
    } else {
        firebase.app(); // if already initialized, use that one
    }
    const db = firebase.firestore()

    const citiesRef = db.collection('users');
    const snapshot = await citiesRef.get();
    snapshot.forEach(async doc => {
        const data1 = doc.data()
        const userID = doc.id
        const newData = calcularData(data1.userBot.validity, data1.userBot.tested)
        let data = {}
        const {
            validity,
            tested
        } = newData

        if(data1.userBot.hasOwnProperty('chatID')){
            data = {
                chatID: data1.userBot.chatID,
                validity,
                tested
            }
        }else{
            data = {
                validity,
                tested
            }
        }
        
        console.log(data)
        await db.collection('users').doc(userID).update({
            userBot: (data)
        })
    });
})*/
app.listen(8000, () => {
    console.log('running');
})