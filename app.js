require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const Blog = require("./models/blog");
const Comment = require("./models/comment");
const User = require("./models/user");
const userRoute = require("./routes/user");
const blogRoute = require("./routes/blog");

const { checkForAuthenticationCookie } = require("./middleware/authentication");
const app = express();
const PORT = process.env.PORT || 8000;

mongoose.connect(process.env.MONGO_URL).then(() => console.log("MongoDB Connected"));

app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));
app.use("/static", express.static(path.resolve("./node_modules")));
app.use(express.static(path.resolve("./public")));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.get("/author/:name", async (req, res) => {
  const nameSlug = req.params.name.trim().replace(/-/g, " ");
  const author = await User.findOne({ fullName: { $regex: new RegExp(`^${escapeRegExp(nameSlug)}$`, "i") } }).lean();
  if (!author) {
    return res.status(404).send("Author not found");
  }

  const blogs = await Blog.find({ createdBy: author._id, isDraft: { $ne: true } })
    .sort({ views: -1, createdAt: -1 })
    .lean();

  const totalViews = blogs.reduce((sum, b) => sum + (b.views || 0), 0);

  return res.render("author", {
    user: req.user,
    author,
    blogs,
    totalBlogs: blogs.length,
    totalViews,
  });
});

app.get("/", async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = 4;
  const search = req.query.search?.trim() || "";
  const selectedCategory = req.query.category?.trim() || "All";
  const query = { isDraft: { $ne: true } };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { body: { $regex: search, $options: "i" } },
    ];
  }

  if (selectedCategory !== "All") {
    query.category = selectedCategory;
  }

  const totalBlogs = await Blog.countDocuments(query);
  const totalPages = Math.max(Math.ceil(totalBlogs / limit), 1);
  const currentPage = Math.min(page, totalPages);

  const allBlogs = await Blog.find(query)
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * limit)
    .limit(limit)
    .lean();

  const blogs = await Promise.all(
    allBlogs.map(async (blog) => {
      const commentCount = await Comment.countDocuments({ blogId: blog._id });
      return {
        ...blog,
        likesCount: blog.likes?.length || 0,
        commentCount,
      };
    })
  );

  const trendingBlogs = await Blog.find({ isDraft: { $ne: true } })
    .sort({ views: -1, createdAt: -1 })
    .limit(5)
    .lean();

  const allPublishedBlogs = await Blog.find({ isDraft: { $ne: true } }).lean();
  const totalViews = allPublishedBlogs.reduce((sum, blog) => sum + (blog.views || 0), 0);
  const totalLikes = allPublishedBlogs.reduce((sum, blog) => sum + (blog.likes?.length || 0), 0);
  const categoryBreakdown = allPublishedBlogs.reduce((acc, blog) => {
    const key = blog.category || "General";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.render("home", {
    user: req.user,
    blogs,
    currentPage,
    totalPages,
    search,
    selectedCategory,
    categories: ["All", "General", "Technology", "Programming", "Lifestyle", "News"],
    trendingBlogs,
    dashboardStats: {
      totalBlogs: allPublishedBlogs.length,
      totalViews,
      totalLikes,
      categories: Object.keys(categoryBreakdown).length,
    },
    categoryBreakdown,
  });
});

app.use("/user", userRoute);
app.use("/blog", blogRoute);
app.listen(PORT, () => console.log(`Server stated at PORT:${PORT}`));
