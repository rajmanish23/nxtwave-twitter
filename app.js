const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const sqlite3 = require('sqlite3')
const path = require('path')
const {open} = require('sqlite')

var db = null
const secretkey = 'Lyjsf26KXzomqroGOlob'
const dbUrl = path.join(__dirname, 'twitterClone.db')

const app = express()
app.use(express.json())

const initializeDB = async () => {
  try {
    db = await open({
      filename: dbUrl,
      driver: sqlite3.Database,
    })
  } catch (error) {
    console.log(`DB ERROR! :: ${error}`)
  }
}

const startServer = () => {
  initializeDB()
  try {
    app.listen(3000, () => {
      console.log('Server running @ http://localhost:3000')
    })
  } catch (error) {
    console.log(`SERVER ERROR! :: ${error}`)
  }
}

const validateToken = (request, response, next) => {
  var token
  const authHeader = request.headers['authorization']
  if (authHeader === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
    return
  }
  token = authHeader.split(' ')[1]
  if (token === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
    return
  }
  jwt.verify(token, secretkey, async (error, payload) => {
    if (error) {
      response.status(401)
      response.send('Invalid JWT Token')
    } else {
      request.username = payload.username
      next()
    }
  })
}

const getUserID = async (request, response, next) => {
  const username = request.username
  const getUserIDQuery = `
    SELECT user_id
    FROM user
    WHERE 
      username LIKE "${username}"
  `
  const result = await db.get(getUserIDQuery)
  request.userID = result.user_id
  next()
}

startServer()

app.post('/register', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `
        SELECT 
            username
        FROM 
            user
        WHERE 
            username LIKE "${username}";
    `
  const result = await db.get(getUserQuery)
  if (result != undefined) {
    response.status(400)
    response.send('User already exists')
    return
  }
  if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
    return
  }
  const hashedPassword = await bcrypt.hash(password, 10)
  const createUserQuery = `
        INSERT INTO 
            user (name, username, password, gender)
        VALUES (
            "${name}", "${username}",
            "${hashedPassword}", "${gender}"
        );
    `
  await db.run(createUserQuery)
  response.status(200)
  response.send('User created successfully')
})

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `
        SELECT 
            username, password
        FROM 
            user
        WHERE
            username LIKE "${username}";
    `
  const result = await db.get(getUserQuery)
  if (result === undefined) {
    response.status(400)
    response.send('Invalid user')
    return
  }
  const isPasswordMatched = await bcrypt.compare(password, result.password)
  if (!isPasswordMatched) {
    response.status(400)
    response.send('Invalid password')
    return
  }
  const payload = {username: username}
  const token = jwt.sign(payload, secretkey)
  response.send({jwtToken: token})
})

app.get(
  '/user/tweets/feed',
  validateToken,
  getUserID,
  async (request, response) => {
    const userID = request.userID
    const getFeedTweetsQuery = `
    SELECT 
      user.username AS username, 
      tweet.tweet AS tweet, 
      tweet.date_time AS dateTime 
    FROM 
      tweet  
    INNER JOIN (
        user 
      INNER JOIN 
        follower 
      ON 
        user.user_id = follower.following_user_id
    ) 
    ON 
      tweet.user_id = user.user_id 
    WHERE
      follower_user_id = ${userID}
    ORDER BY 
      tweet.date_time DESC 
    LIMIT 4;
    `
    const result = await db.all(getFeedTweetsQuery)
    response.send(result)
  },
)

app.get(
  '/user/following',
  validateToken,
  getUserID,
  async (request, response) => {
    const userID = request.userID
    const getFollowingQuery = `
      SELECT 
        name 
      FROM 
        user 
      INNER JOIN 
        follower 
        ON user.user_id = follower.following_user_id 
      WHERE 
        follower_user_id = ${userID};
    `
    const followingList = await db.all(getFollowingQuery)
    response.send(followingList)
  },
)

app.get(
  '/user/followers',
  validateToken,
  getUserID,
  async (request, response) => {
    const userID = request.userID
    const getFollowerQuery = `
      SELECT 
        name 
      FROM 
        user 
      INNER JOIN 
        follower 
        ON user.user_id = follower.follower_user_id 
      WHERE 
        following_user_id = ${userID};
    `
    const followerList = await db.all(getFollowerQuery)
    response.send(followerList)
  },
)

// TODO: get likes and replies count
app.get(
  '/tweets/:tweetId',
  validateToken,
  getUserID,
  async (request, response) => {
    const tweetId = request.params.tweetId
    const userID = request.userID
    const getFeedTweetsQuery = `
    select 
      tweet.tweet, 
      count(distinct like.like_id) as likes,
      count(distinct reply.reply_id) as replies, 
      tweet.date_time as dateTime 
    from 
      like 
    inner join (
        reply 
      inner join (
          tweet 
        inner join (
            user 
          inner join 
            follower 
          on 
            user.user_id = follower.following_user_id
        ) 
        on 
          tweet.user_id = user.user_id
      ) 
      on 
        reply.tweet_id = tweet.tweet_id
    ) 
    on 
      like.tweet_id = tweet.tweet_id 
    where 
      follower_user_id = ${userID} 
      and tweet.tweet_id = ${tweetId};
    `
    const result = await db.get(getFeedTweetsQuery)
    if (result.tweet === null) {
      response.status(401)
      response.send('Invalid Request')
      return
    }
    response.send(result)
  },
)

app.get(
  '/tweets/:tweetId/likes',
  validateToken,
  getUserID,
  async (request, response) => {
    const tweetId = request.params.tweetId
    const userID = request.userID
    const getFeedTweetsQuery = `
    select 
      username 
    from 
      user 
    join (
      select 
        like.user_id as userID 
      from 
        like 
      inner join (
          tweet 
        inner join (
            user 
          inner join 
            follower 
          on 
            user.user_id = follower.following_user_id
        ) 
        on
          tweet.user_id = user.user_id
      ) 
      on 
        tweet.tweet_id = like.tweet_id 
      where 
        follower.follower_user_id = ${userID} 
        and tweet.tweet_id = ${tweetId}
    ) on 
      user.user_id = userID 
    order by 
      user.user_id asc;
    `
    const result = await db.all(getFeedTweetsQuery)
    if (result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
      return
    }
    var likesList = []
    result.forEach(obj => {
      likesList.push(obj.username)
    })
    response.send({likes: likesList})
  },
)

app.get(
  '/tweets/:tweetId/replies',
  validateToken,
  getUserID,
  async (request, response) => {
    const tweetId = request.params.tweetId
    const userID = request.userID
    const getFeedTweetsQuery = `
    select name, replyText as reply
    from user join
    (select 
      reply.user_id as userID, 
      reply.reply as replyText
    from 
      reply 
      inner join (
        tweet 
        inner join (
          user 
          inner join 
          follower 
          on 
          user.user_id = follower.following_user_id
        ) 
        on 
        tweet.user_id = user.user_id
      ) 
      on 
      tweet.tweet_id = reply.tweet_id 
    where 
      follower.follower_user_id = ${userID} 
      and tweet.tweet_id = ${tweetId})
    on user.user_id = userID;
    `
    const result = await db.all(getFeedTweetsQuery)
    if (result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
      return
    }
    response.send({replies: result})
  },
)

app.get('/user/tweets', validateToken, getUserID, async (request, response) => {
  const userID = request.userID
  const getUserTweetsQuery = `
      select 
        tweet.tweet as tweet, 
        count(distinct like.like_id) as likes, 
        count(distinct reply.reply_id) as replies,
        tweet.date_time as dateTime 
      from 
        like 
      inner join (
          reply 
        inner join 
          tweet 
        on 
          reply.tweet_id = tweet.tweet_id
      ) 
      on 
        like.tweet_id = tweet.tweet_id 
      where 
        tweet.user_id = ${userID} 
      group by 
        tweet.tweet_id;
    `
  const results = await db.all(getUserTweetsQuery)
  response.send(results)
})

app.post(
  '/user/tweets',
  validateToken,
  getUserID,
  async (request, response) => {
    const userID = request.userID
    const {tweet} = request.body
    const postTweetQuery = `
      INSERT INTO
        tweet (tweet, user_id)
      VALUES
        (
          "${tweet}",
          ${userID}
        );
    `
    await db.run(postTweetQuery)
    response.send('Created a Tweet')
  },
)

app.delete(
  '/tweets/:tweetId',
  validateToken,
  getUserID,
  async (request, response) => {
    const {tweetId} = request.params
    const userID = request.userID
    const query = `
    select
      * 
    from 
      tweet 
    inner join 
      user 
    on 
      user.user_id = tweet.user_id
    where 
      tweet.tweet_id = ${tweetId}
      and user.user_id = ${userID};
  `
    var result = await db.get(query)
    if (result === undefined) {
      response.status(401)
      response.send('Invalid Request')
      return
    }
    const deleteQuery = `
    delete from 
      tweet
    where 
      tweet_id = ${tweetId};
    `
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  },
)

module.exports = app
