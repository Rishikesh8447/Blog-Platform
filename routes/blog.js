const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");

const Blog = require("../models/blog");
const Comment = require("../models/comment");

const router = Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.resolve("./public/uploads"));
  },
  filename: function (req, file, cb) {
    const fileName = `${Date.now()}-${file.originalname}`;
    cb(null, fileName);
  },
});
const upload = multer({ storage });

async function findBlogBySlugOrId(identifier) {
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const blogById = await Blog.findById(identifier).populate("createdBy");
    if (blogById) return blogById;
  }

  return Blog.findOne({ slug: identifier }).populate("createdBy");
}

function buildToc(body) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("#"))
    .map((line, index) => ({
      id: `section-${index + 1}`,
      text: line.replace(/^#+\s*/, ""),
      level: Math.min((line.match(/^#+/) || ["#"])[0].length, 3),
    }));
}

function buildContentBlocks(body) {
  let headingIndex = 0;

  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("#")) {
        headingIndex += 1;
        return {
          type: "heading",
          id: `section-${headingIndex}`,
          level: Math.min((line.match(/^#+/) || ["#"])[0].length, 3),
          text: line.replace(/^#+\s*/, ""),
        };
      }

      return {
        type: "paragraph",
        text: line,
      };
    });
}

function unsafeEscape(text = "") {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdownAsHtml(body) {
  if (!body) {
    return "<p class='text-slate-500'>No content yet.</p>";
  }

  const lines = body.split("\n");
  let inCode = false;
  let listOpen = false;
  const html = [];

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  for (let line of lines) {
    if (line.trim() === "```") {
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        html.push("<pre class='rounded bg-slate-900 p-3 text-slate-100 overflow-x-auto'><code>");
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      html.push(unsafeEscape(line) + "\n");
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h2 class='mt-4 text-2xl font-bold text-slate-900'>${unsafeEscape(line.slice(2).trim())}</h2>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h3 class='mt-3 text-xl font-semibold text-slate-800'>${unsafeEscape(line.slice(3).trim())}</h3>`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h4 class='mt-3 text-lg font-semibold text-slate-700'>${unsafeEscape(line.slice(4).trim())}</h4>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote class='border-l-4 border-slate-300 pl-3 italic text-slate-600'>${unsafeEscape(line.slice(2).trim())}</blockquote>`);
      continue;
    }
    if (line.match(/^(-|\*|\d+\.)\s+/)) {
      if (!listOpen) {
        listOpen = true;
        html.push("<ul class='list-disc pl-5 text-slate-700'>");
      }
      const trimmed = line.replace(/^(-|\*|\d+\.)\s+/, "");
      html.push(`<li>${unsafeEscape(trimmed)}</li>`);
      continue;
    }

    closeList();
    if (!line.trim()) {
      html.push("<br>");
      continue;
    }

    let escaped = unsafeEscape(line)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code class='rounded bg-slate-100 px-1'>$1</code>")
      .replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, "<img src='$2' alt='$1' class='my-2 max-h-96 w-full rounded border border-slate-200 object-cover' />");

    html.push(`<p class='mb-2 leading-7 text-slate-700'>${escaped}</p>`);
  }

  if (listOpen) {
    html.push("</ul>");
  }

  if (inCode) {
    html.push("</code></pre>");
  }

  return html.join("\n");
}

router.get("/add-new", (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  return res.render("addBlog", {
    user: req.user,
  });
});

router.get("/random", async (req, res) => {
  const [randomBlog] = await Blog.aggregate([
    { $match: { isDraft: { $ne: true } } },
    { $sample: { size: 1 } },
  ]);

  if (!randomBlog) {
    return res.redirect("/");
  }

  return res.redirect(`/blog/${randomBlog.slug || randomBlog._id}`);
});

router.get("/stats/dashboard", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blogs = await Blog.find({ createdBy: req.user._id }).lean();
  const blogIds = blogs.map((blog) => blog._id);
  const comments = await Comment.find({ blogId: { $in: blogIds } }).lean();
  const commentsCount = comments.length;
  const totalViews = blogs.reduce((sum, blog) => sum + (blog.views || 0), 0);
  const totalLikes = blogs.reduce((sum, blog) => sum + (blog.likes?.length || 0), 0);
  const categoryBreakdown = blogs.reduce((acc, blog) => {
    const key = blog.category || "General";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const commentCountMap = comments.reduce((acc, comment) => {
    const key = comment.blogId.toString();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const mostViewedBlog = [...blogs].sort((a, b) => (b.views || 0) - (a.views || 0))[0] || null;
  const mostCommentedBlog =
    [...blogs].sort((a, b) => (commentCountMap[b._id.toString()] || 0) - (commentCountMap[a._id.toString()] || 0))[0] ||
    null;

  return res.render("stats", {
    user: req.user,
    totalBlogs: blogs.length,
    draftsCount: blogs.filter((blog) => blog.isDraft).length,
    publishedCount: blogs.filter((blog) => !blog.isDraft).length,
    totalViews,
    totalLikes,
    commentsCount,
    topBlogs: [...blogs]
      .sort((a, b) => (b.views || 0) + (b.likes?.length || 0) - ((a.views || 0) + (a.likes?.length || 0)))
      .slice(0, 5),
    categoryBreakdown,
    averageReadingTime: blogs.length
      ? Math.round(blogs.reduce((sum, blog) => sum + (blog.readingTime || 1), 0) / blogs.length)
      : 0,
    mostViewedBlog,
    mostCommentedBlog,
    commentCountMap,
  });
});

router.get("/:slug/edit", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blog = await findBlogBySlugOrId(req.params.slug);
  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  if (blog.createdBy._id.toString() !== req.user._id) {
    return res.status(403).send("Not authorized");
  }

  return res.render("editBlog", {
    user: req.user,
    blog,
  });
});

router.post("/:blogId/update", upload.any(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blog = await Blog.findById(req.params.blogId);
  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  if (blog.createdBy.toString() !== req.user._id) {
    return res.status(403).send("Not authorized");
  }

  blog.versionHistory.push({
    title: blog.title,
    category: blog.category,
    body: blog.body,
    updatedAt: new Date(),
  });

  blog.title = req.body.title;
  blog.category = req.body.category || "General";
  blog.body = req.body.body;
  blog.isDraft = req.body.isDraft === "on";

  const uploadedFile = req.files?.[0];
  if (uploadedFile) {
    blog.coverImageURL = `/uploads/${uploadedFile.filename}`;
  }

  await blog.save();
  return res.redirect(blog.isDraft ? "/blog/stats/dashboard" : `/blog/${blog.slug}`);
});

router.post("/:blogId/delete", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blog = await Blog.findById(req.params.blogId);
  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  if (blog.createdBy.toString() !== req.user._id) {
    return res.status(403).send("Not authorized");
  }

  await Comment.deleteMany({ blogId: blog._id });
  await Blog.findByIdAndDelete(blog._id);

  return res.redirect("/blog/stats/dashboard");
});

router.get("/:slug/history", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blog = await findBlogBySlugOrId(req.params.slug);
  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  if (blog.createdBy._id.toString() !== req.user._id) {
    return res.status(403).send("Not authorized");
  }

  return res.render("history", {
    user: req.user,
    blog,
    versions: [...blog.versionHistory].reverse(),
  });
});

router.get("/:slug", async (req, res) => {
  const blog = await findBlogBySlugOrId(req.params.slug);

  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  if (blog.isDraft && (!req.user || req.user._id !== blog.createdBy._id.toString())) {
    return res.status(404).send("Blog not found");
  }

  blog.views += 1;
  await blog.save();

  const comments = await Comment.find({ blogId: blog._id }).populate("createdBy");
  const recommendations = await Blog.find({
    _id: { $ne: blog._id },
    category: blog.category,
    isDraft: { $ne: true },
  })
    .sort({ views: -1, createdAt: -1 })
    .limit(3)
    .lean();

  return res.render("blog", {
    user: req.user,
    blog,
    comments,
    likesCount: blog.likes?.length || 0,
    isLikedByUser: req.user ? blog.likes.some((like) => like.toString() === req.user._id) : false,
    recommendations,
    toc: buildToc(blog.body || ""),
    contentBlocks: buildContentBlocks(blog.body || ""),
    renderedBody: renderMarkdownAsHtml(blog.body || ""),
    canManage: req.user ? blog.createdBy._id.toString() === req.user._id : false,
  });
});

router.post("/comment/:blogId", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blog = await Blog.findById(req.params.blogId);
  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  await Comment.create({
    content: req.body.content,
    blogId: req.params.blogId,
    createdBy: req.user._id,
  });
  return res.redirect(`/blog/${blog.slug}`);
});

router.post("/like/:blogId", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const blog = await Blog.findById(req.params.blogId);
  if (!blog) {
    return res.status(404).send("Blog not found");
  }

  const alreadyLiked = blog.likes.some((like) => like.toString() === req.user._id);

  if (alreadyLiked) {
    blog.likes = blog.likes.filter((like) => like.toString() !== req.user._id);
  } else {
    blog.likes.push(req.user._id);
  }

  await blog.save();
  return res.redirect(`/blog/${blog.slug}`);
});

router.post("/", upload.any(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  const { title, body, category, isDraft } = req.body;
  const uploadedFile = req.files?.[0];
  const blog = await Blog.create({
    body,
    title,
    category: category || "General",
    isDraft: isDraft === "on",
    createdBy: req.user._id,
    coverImageURL: uploadedFile ? `/uploads/${uploadedFile.filename}` : undefined,
  });
  return res.redirect(blog.isDraft ? "/blog/stats/dashboard" : `/blog/${blog.slug}`);
});

module.exports = router;
