const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");

var Mailgun = require("mailgun-js");

const User = require("../models/User");

const response = require("../responses");
const validateToken = require("../utils/validate-token");
const generateAccessToken = require("../utils/generateAccessToken");

router.get("/", async function (req, res) {
  res.send(await User.find());
});

router.post("/register", async function (req, res) {
  if (
    !req.body.username ||
    !req.body.password ||
    !req.body.email ||
    !req.body.firstname ||
    !req.body.lastname
  ) {
    res.status(400);
    res.send(
      response(
        false,
        '"username" & "password" & "email" & "firstname" & "lastname" must be sent'
      )
    );
  }

  let user = new User({
    username: req.body.username,
    password: req.body.password,
    email: req.body.email,
    firstname: req.body.firstname,
    lastname: req.body.lastname,
  });

  if (user) {
    try {
      const userExist = await User.find({
        username: req.body.username,
        email: req.body.email,
      });
      if (userExist.length === 0) {
        const salt = await bcrypt.genSalt();
        user.password = await bcrypt.hash(user.password, salt);
        user.token = generateAccessToken(user);
        await user.save();
        res.json({
          user: {
            username: user.username,
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            token: user.token,
          },
          message: "Registration success",
          success: true,
        });
      } else {
        res.send({ message: "User already exist", canRegister: false });
      }
    } catch (err) {
      throw new Error(err);
    }
  }
});
router.post("/login", async function (req, res) {
  try {
    let credentials = {
      username: req.body.username,
      password: req.body.password,
    };
    if (credentials.password && credentials.username) {
      const user = await User.findOne({
        username: credentials.username,
      });
      if (user && User.login(credentials.password, user.password)) {
        res.send(response(true, User.toJSON(user)));
      } else {
        console.log("ERROR 1");
        res.send(response(false, "Invalid credentials"));
      }
    } else {
      res.send(response(false, "You must sent username & password"));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post("/changePassword", async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    const user = await User.find({ username: username });

    if (user.length <= 0) {
      return res.send({ message: "User not found", canChangePassword: false });
    } else {
      const salt = await bcrypt.genSalt();
      const newPass = await bcrypt.hash(newPassword, salt);
      const newToken = generateAccessToken(user);

      await User.updateOne(
        { _id: user[0]._id },
        {
          password: newPass,
          token: newToken,
        }
      );
      res.send({ message: "Password changed", canChangePassword: true });
    }
    res.send({ message: "Password changed", canChangePassword: true });
  } catch (err) {
    res.send({ message: err.message, canChangePassword: false });
    throw new Error(err);
  }
});

router.patch("/deposit", validateToken, async function (req, res) {
  const value = req.body.value;
  if (value && value > 0) {
    try {
      const user = await User.find({ token: req.header("auth-token") });
      if (user.length > 0) {
        await User.updateOne(
          {
            token: req.header("auth-token"),
          },
          {
            $inc: {
              fiat: value,
            },
          }
        );
      }
    } catch (err) {
      throw new Error(err);
    }

    res.send({ message: "Deposit finished", depositFinished: true });
  } else {
    res.send({ message: "Invalid Value", depositFinished: false });
  }
});

router.patch("/withdrawal", validateToken, async function (req, res) {
  const value = req.body.value;
  if (value && value > 0) {
    try {
      const user = await User.findOne({ token: req.header("auth-token") });

      if (user) {
        if (user.fiat >= value) {
          await user.updateOne({
            $inc: {
              fiat: -value,
            },
          });
          res.send({ message: "withdrawal OK", withdrawFinished: true });
        } else {
          res.send({
            message: "anda a trabajar vago de mierd*, no tenes tanta plata",
            withdrawFinished: false,
          });
        }
      }
    } catch (err) {
      throw new Error(err);
    }
  } else {
    res.send({ message: "Invalid Value", withdrawFinished: false });
  }
});
router.post("/data", async function (req, res) {
  try {
    if (req.body.token) {
      const userExist = await User.findOne({
        token: req.body.token,
      });
      if (userExist) {
        res.json({
          message: {
            username: userExist.username,
            email: userExist.email,
            firstname: userExist.firstname,
            lastname: userExist.lastname,
          },
          success: true,
        });
      } else {
        return res.send({ message: "Invalid token", canLogin: false });
      }
    } else {
      res.send({ message: "'token' must be sent", canLogin: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/otp", async function (req, res) {
  if (!req.body || !req.body.mail) {
    res.status(400).json({ error: "Mandatory values not found" });
    return;
  }

  const userExist = await User.findOne({
    email: req.body.mail,
  });

  var mailgun = new Mailgun({
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
  });
  let otpNumber = Math.floor(Math.random() * (9999 - 1000) + 1000);
  let mailSended = false;

  let data = {
    //Specify email data
    from: "no-reply@walcow.com",
    //The email to contact
    to: req.body.mail,
    //Subject and text data
    subject: "OTP WALCOW OTP VALIDATION",
    html: `Hello!, use this code in the OTP validation: ${otpNumber}`,
  };

  try {
    if (userExist) {
      mailSended = true;
      let dataSend = await mailgun.messages().send(data);
    }

    res.status(200).json({
      emailSended: mailSended,
      user: userExist,
      otp: otpNumber,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
