const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const multer = require('multer');
const MongoClient = require('mongodb').MongoClient;
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const upload = multer();
const cors = require('cors');
require('dotenv').config();
//middleware

app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// socket.io;
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
let roomList = [];

io.on('connection', (socket) => {
  let roomId = '';
  let currentUser = 'unknown';

  socket.on('join', (data) => {
    roomId = data.roomId;
    currentUser = data.name;
    let roomExists = false;

    if (roomList.length > 0) {
      for (let i = 0; i < roomList.length; i++) {
        if (
          roomList[i][0] === data.roomId.split(' ')[0] &&
          roomList[i][1] === data.roomId.split(' ')[1]
        ) {
          roomExists = true;
          roomId = roomList[i].join(' ');
          break;
        } else if (
          roomList[i][1] === data.roomId.split(' ')[0] &&
          roomList[i][0] === data.roomId.split(' ')[1]
        ) {
          roomExists = true;
          roomId = roomList[i].join(' ');
          break;
        }
      }
    }
    if (!roomExists) {
      roomList.push(data.roomId.split(' '));
      roomId = data.roomId;
    }

    socket.join(roomId);
    io.to(roomId).emit('clientJoined', `Пользователь ${currentUser} подключился`);
  });

  socket.on('message', (data) => {
    socket.broadcast.to(roomId).emit('messageReceived', data.data);
  });

  socket.on('disconnect', () => {
    io.to(roomId).emit('disconnectUser', `Пользователь ${currentUser} отключился`);
  });
});

//старт сервера

server.listen(process.env.PORT, () => {
  console.log(`Server running at port ${process.env.PORT}`);
});

//бд

const mongoClient = new MongoClient(process.env.MONGO_URL);

// Открытие клиента при запуске приложения
async function startMongoClient() {
  try {
    await mongoClient.connect();
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
  }
}

startMongoClient();

// Закрытие клиента при завершении работы приложения
process.on('SIGINT', async () => {
  try {
    await mongoClient.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (err) {
    console.error('Failed to close MongoDB connection', err);
    process.exit(1);
  }
});

//функции

async function sendMessage(data) {
  try {
    // await mongoClient.connect();
    const db = mongoClient.db('mongo');
    const collection = await db.collection('chats');
    const find1 = await collection
      .find({ firstUser: data.firstUserData, secondUser: data.secondUserData })
      .toArray();
    const find2 = await collection
      .find({ firstUser: data.secondUserData, secondUser: data.firstUserData })
      .toArray();

    if (find1.length > 0 || find2.length > 0) {
      if (find1.length > find2.length) {
        await collection.updateOne(
          { firstUser: data.firstUserData, secondUser: data.secondUserData },
          { $push: { chat: data.message } },
        );
        return 'Поле объекта в документе изменено';
      } else {
        await collection.updateOne(
          { firstUser: data.secondUserData, secondUser: data.firstUserData },
          { $push: { chat: data.message } },
        );
        return 'Поле объекта в документе изменено';
      }
    } else return 'таких нет';
  } catch (err) {
    console.log(err, 'its error');
  } finally {
    // await mongoClient.close();
  }
}

async function sendPost(data) {
  try {
    // await mongoClient.connect();
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    const user = await collection.findOne({ name: data.name });
    if (!user) {
      return { success: false, message: 'Пользователь не найден' };
    }

    if (!user.posts) {
      user.posts = [];
    }

    user.posts.push(data.message);
    const result = await collection.updateOne(
      { name: data.name },
      { $push: { posts: data.message } },
    );

    return result;
  } catch (err) {
    console.log(err, 'its error');
    return { success: false, message: 'Произошла ошибка' };
  } finally {
    // await mongoClient.close();
  }
}

async function sendPhotos(data) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    const user = await collection.findOne({ name: data.name });
    if (!user) {
      return { success: false, message: 'Пользователь не найден' };
    }

    const result = await collection.updateOne(
      { name: data.name },
      { $push: { photos: { ...data.info, file: data.file } } },
    );
    console.log('Photos sent successfully');

    return { success: true, message: 'Данные добавлены' };
  } catch (error) {
    console.error('Error sending photos:', error);
    throw error; // Бросаем ошибку для обработки выше
  }
}

async function uploadMessage(data) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('chats');
    const find1 = await collection.find({ firstUser: data.user }).toArray();
    const find2 = await collection.find({ secondUser: data.user }).toArray();
    if (find1.length !== 0 && find2.length == 0) {
      return find1;
    } else {
      if (find2.length !== 0 && find1.length == 0) return find2;
      else {
        if (find2.length !== 0 && find1.length !== 0) {
          return [...find1, ...find2];
        } else return 'nothing';
      }
    }
  } catch (err) {
    console.log(err, 'its error');
  }
}
async function checkChat(log1, log2) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('chats');
    const find1 = await collection.find({ firstUser: log1, secondUser: log2 }).toArray();
    const find2 = await collection.find({ firstUser: log2, secondUser: log1 }).toArray();

    if (find1.length === 0 && find2.length === 0) {
      return 'Такого чата нет';
    } else {
      return 'Чат уже существует';
    }
  } catch (err) {
    console.log(err, 'its error');
  }
}
async function uploadChat(log1, log2) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('chats');
    await collection.insertOne({
      firstUser: log1,
      secondUser: log2,
      chat: [],
    });
    return 'Чат успешно создан';
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function getPersonalMessage(data) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('chats');
    const find1 = await collection
      .find({ firstUser: data.firstUserData, secondUser: data.secondUserData })
      .toArray();
    const find2 = await collection
      .find({ firstUser: data.secondUserData, secondUser: data.firstUserData })
      .toArray();
    if (find1.length !== 0 && find2.length == 0) {
      return find1;
    } else {
      if (find2.length !== 0 && find1.length == 0) return find2;
      else {
        if (find2.length !== 0 && find1.length !== 0) {
          return [...find1, ...find2];
        } else return 'nothing';
      }
    }
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function findUser(log, pass) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    const find = await collection.find({ name: log, password: pass }).toArray();
    return find;
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function findUserWithouPass(log) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    const find = await collection.find({ name: log }).toArray();
    return find;
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function insertOneUser(user) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    await collection.insertOne(user);
    return 'Good';
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function getAllUser() {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    const users = await collection.find().toArray();

    return users;
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function deleteFriend(log, log2) {
  try {
    const userLog = await findUserWithouPass(log); //author

    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');

    if (userLog[0].friends.length > 1 && userLog[0].friends.find((v) => v.name === log2)) {
      await collection.updateOne({ name: log }, { $pull: { friends: { name: log2 } } });
      await collection.updateOne({ name: log2 }, { $pull: { friends: { name: log } } });
      const friendsList = await getuserlist(log, 'friends');
      return { text: 'Пользователь удален', data: { friends: friendsList } };
    } else {
      return { text: 'Условия не выполнены', data: null };
    }
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function subscribe(log, log2) {
  try {
    const userLog = await findUserWithouPass(log); //author
    const friendData = await findUserWithouPass(log2); //second

    if (friendData[0].subscriber.length > 1) {
      const newArray = friendData[0].subscriber.slice(1);
      if (newArray.find((v) => v.name === log)) {
        return { text: 'Ты уже подписан на него', data: null };
      }
    }
    if (friendData[0].subscribed.length > 1) {
      const newArray = friendData[0].subscribed.slice(1);
      if (newArray.find((v) => v.name === log)) {
        const response = await addfriend(log, log2);

        return response;
      }
    }
    if (friendData[0].friends.length > 1) {
      const newArray = friendData[0].friends.slice(1);
      if (newArray.find((v) => v.name === log)) {
        return { text: 'Ты у него в друзьях', data: null };
      }
    }

    const {
      friends: friends1,
      subscribed: subscribed1,
      subscriber: subscriber1,
      posts: posts1,
      ...userLog2
    } = userLog[0]; //author
    const {
      friends: friends2,
      posts: posts2,
      subscribed: subscribed2,
      subscriber: subscriber2,
      ...friendData2
    } = friendData[0]; //second
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    await collection.updateOne({ name: log }, { $push: { subscribed: friendData2 } });
    await collection.updateOne({ name: log2 }, { $push: { subscriber: userLog2 } });

    const subscribedList = await getuserlist(log, 'subscribed');

    const data = await findUserWithouPass(log);
    return { text: 'Подписка оформлена', data: { subscribed: subscribedList } };
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function addfriend(log, log2) {
  //log - тот кто добавляет
  //friendName - тот кого добавляют
  try {
    const user1 = await findUserWithouPass(log); //author
    const user2 = await findUserWithouPass(log2); //second

    const newArray = user2[0].subscribed.slice(1);

    const {
      friends: friends1,
      subscribed: subscribed1,
      subscriber: subscriber1,
      posts: posts1,
      ...userData1
    } = user1[0]; //author
    const {
      friends: friends2,
      posts: posts2,
      subscribed: subscribed2,
      subscriber: subscriber2,
      ...userData2
    } = user2[0]; //second

    if (newArray.length > 0 && newArray.find((v) => v.name === log)) {
      const db = mongoClient.db('mongo');
      const collection = await db.collection('users');

      await collection.updateOne({ name: log }, { $push: { friends: userData2 } });
      await collection.updateOne({ name: log2 }, { $push: { friends: userData1 } });

      await deletesubscribe(log2, log);
    } else {
      return { text: 'Он на вас не подписан', data: null };
    }
    const subscriberLists = await getuserlist(log, 'subscriber');
    const friendsLists = await getuserlist(log, 'friends');

    return { text: 'Друг добавлен', data: { subscriber: subscriberLists, friends: friendsLists } };
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function cancelSub(log, log2) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');

    await collection.updateOne({ name: log }, { $pull: { subscribed: { name: log2 } } });
    await collection.updateOne({ name: log }, { $pull: { subscriber: { name: log2 } } });
    await collection.updateOne({ name: log2 }, { $pull: { subscribed: { name: log } } });
    await collection.updateOne({ name: log2 }, { $pull: { subscriber: { name: log } } });

    const subscribedLists = await getuserlist(log, 'subscribed');
    const subscriberLists = await getuserlist(log, 'subscriber');

    return {
      text: 'Подписка отменена',
      data: { subscribed: subscribedLists, subscriber: subscriberLists },
    };
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function deletesubscribe(log, log2) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    await collection.updateOne({ name: log2 }, { $pull: { subscriber: { name: log } } });
    await collection.updateOne({ name: log }, { $pull: { subscribed: { name: log2 } } });

    const subscribesLists = await getuserlist(log, 'subscribes');

    const data = await findUserWithouPass(log);
    return { text: 'Пользователь удален', data };
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function checkDependence(log, log2) {
  try {
    const userLog = await findUserWithouPass(log);

    if (userLog?.length > 0) {
      if (userLog[0].friends.length > 0) {
        const flag = userLog[0].friends.slice(1).find((v) => v.name === log2);
        if (flag) {
          return 'friends';
        }
      }

      if (userLog[0].friends.length > 0) {
        const flag = userLog[0].subscriber.slice(1).find((v) => v.name === log2);
        if (flag) {
          return 'subscriber';
        }
      }

      if (userLog[0].friends.length > 0) {
        const flag = userLog[0].subscribed.slice(1).find((v) => v.name === log2);
        if (flag) {
          return 'subscribed';
        }
      }

      return 'nothing';
    }

    return 'Такого человека нет';
  } catch (err) {
    console.log(err, 'its error');
  }
}

async function getphotos(log) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('users');
    const user = await collection.find({ name: log }).toArray();
    if (user[0]) {
      return user[0].photos;
    } else {
      return 'error';
    }
  } catch (err) {
    console.log(err, 'its error');
    return 'error';
  }
}

async function changeProfileData(data, name) {
  const db = mongoClient.db('mongo');
  const collection = await db.collection('users');
  const result = await collection.updateOne(
    { name },
    {
      $set: data,
    },
  );

  return result;
}

async function getuserchats(log) {
  try {
    const db = mongoClient.db('mongo');
    const collection = await db.collection('chats');
    const find1 = await collection.find({ firstUser: log }).toArray();
    const find2 = await collection.find({ secondUser: log }).toArray();

    const result = [];
    if (find1.length > 0) {
      find1.map((v) => {
        result.push(v);
      });
    }
    if (find2.length > 0) {
      find2.map((v) => {
        result.push(v);
      });
    }

    if (result.length > 0) {
      return result;
    } else {
      return 'Чатов нет';
    }
  } catch (err) {
    console.log(err, 'its error');
    return 'error';
  }
}

async function getuserlist(name, type) {
  try {
    let data = await findUserWithouPass(name);
    if (typeof data[0] === 'object') {
      if (data[0][type]) {
        const resultList = await Promise.all(
          data[0][type].map(async (v) => {
            const data = await findUserWithouPass(v?.name);
            if (data.length > 0) {
              return data[0];
            } else {
              return undefined;
            }
          }),
        );
        return resultList;
      } else {
        return [];
      }
    } else {
      return 'user not found';
    }
  } catch (error) {
    console.log(error);
    response.send(error);
  }
}

//запросы

app.post('/uploadmessage', upload.none(), async (req, res) => {
  uploadMessage(req.body).then((r) => res.send(r));
});

app.post('/personalMessage', upload.none(), async (req, res) => {
  getPersonalMessage(req.body).then((r) => res.send(r));
});

app.post('/sendMessage', upload.none(), async (req, res) => {
  sendMessage(req.body).then((r) => res.send(r));
});

app.post('/loginUser', upload.none(), async (req, res) => {
  try {
    const resultArr = await findUser(req.body.log, req.body.pass).catch(console.error);

    if (resultArr.length > 0) {
      res.send(resultArr);
    } else {
      res.status(401).send('Unauthorized: User not found');
    }
  } catch (error) {
    res.status(401).send('Unauthorized: User not found');
  }
});

app.post('/registrationUser', upload.none(), async (req, res) => {
  try {
    const resultArr = await findUserWithouPass(req.body.name).catch(console.error);

    if (resultArr.length > 0) {
      res.status(401).send(`Такой пользователь зарегестрирован`);
    } else {
      insertOneUser(req.body);
      res.status(200).send(`Пользователь зарегестрирован`);
    }
  } catch (error) {
    res.status(401).send('Chota all bad');
  }
});

app.get('/getallusers', async (request, response) => {
  try {
    let data = await getAllUser();
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.get('/getuser', async (request, response) => {
  try {
    let data = await findUserWithouPass(request.query.name);
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(404);
  }
});

app.patch(`/deletefriend`, async (request, response) => {
  try {
    const data = await deleteFriend(request.query.name, request.body.user);
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.patch(`/subscribe`, async (request, response) => {
  try {
    const data = await subscribe(request.query.name, request.body.user);

    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.patch(`/cancelsub`, async (request, response) => {
  try {
    const data = await cancelSub(request.query.name, request.body.user);

    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.patch(`/addfriend`, async (request, response) => {
  try {
    const data = await addfriend(request.query.name, request.body.user);

    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.post('/sendPost', upload.array('files'), async (req, res) => {
  let data = { name: req?.body.name, message: req?.body.message };
  if (req?.files) {
    data.message.files = req?.files;
    req.files.forEach((file) => {
      console.log(file.originalname);
    });
  }
  sendPost(data)
    .then((r) => res.send(r))
    .catch(console.log);
});

app.post('/sendPhoto', upload.fields([{ name: 'file' }]), async (req, res) => {
  let data = { name: req?.body.name, info: req?.body.photo, file: req?.files.file };

  let response = await sendPhotos(data);

  res.send(response);
});

app.get('/checkdependence', async (request, response) => {
  try {
    let data = await checkDependence(request.query.log, request.query.log2);
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.get('/getphotos', async (request, response) => {
  try {
    let data = await getphotos(request.query.name);
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.get('/getuserlist', async (request, response) => {
  try {
    const data = await getuserlist(request.query.name, request.query.type);
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.get('/uploadchat', async (request, response) => {
  try {
    let flag = await checkChat(request.query.log1, request.query.log2);
    if (flag === 'Такого чата нет') {
      let data = await uploadChat(request.query.log1, request.query.log2);
      response.status(200).send(data);
    } else {
      response.status(200).send(flag);
    }
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.get('/getuserchats', async (request, response) => {
  try {
    const data = await getuserchats(request.query.name);
    response.status(200).send(data);
  } catch (error) {
    console.log(error);
    response.send(error);
  }
});

app.post('/changeprofiledata', upload.array('files'), async (req, res) => {
  const data = await changeProfileData({ ...req.body.profileDataObj }, req.body.name);
  res.status(200).send(data);
});
