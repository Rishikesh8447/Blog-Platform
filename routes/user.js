const { Router } = require("express");
const User = require("../models/user");
const Blog = require("../models/blog");
const router = Router();

router.get("/signin", (req, res) => {
  return res.render("signin");
});

router.get("/signup", (req, res) => {
  return res.render("signup");
});

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const token = await User.matchPasswordAndGenerateToken(email, password);
    return res.cookie("token", token).redirect("/");
  } catch (error) {
    return res.render("signin", {
      error: "incorrect email or password",
    });
  }
});

router.get("/logout", (req, res) => {
  res.clearCookie("token").redirect("/");
});

router.post("/signup", async (req, res) => {
  const { fullName, email, password } = req.body;
  await User.create({
    fullName,
    email,
    password,
  });
  return res.redirect("/");
});

router.get("/:id", async (req, res) => {
  const author = await User.findById(req.params.id).lean();

  if (!author) {
    return res.status(404).send("Author not found");
  }

  const blogs = await Blog.find({ createdBy: author._id, isDraft: { $ne: true } }).sort({ createdAt: -1 }).lean();

  return res.render("author", {
    user: req.user,
    author,
    blogs,
  });
});

module.exports = router;
