const { Schema, model } = require("mongoose");

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function calculateReadingTime(body) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

const versionSchema = new Schema(
  {
    title: String,
    category: String,
    body: String,
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const blogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    category: {
      type: String,
      default: "General",
    },
    body: {
      type: String,
      required: true,
    },
    coverImageURL: {
      type: String,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
    readingTime: {
      type: Number,
      default: 1,
    },
    isDraft: {
      type: Boolean,
      default: false,
    },
    versionHistory: {
      type: [versionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

blogSchema.pre("validate", function () {
  if (!this.slug || this.isModified("title")) {
    const baseSlug = slugify(this.title || "blog");
    this.slug = `${baseSlug}-${this._id}`;
  }

  if (this.isModified("body")) {
    this.readingTime = calculateReadingTime(this.body || "");
  }
});

blogSchema.pre("save", function () {
  if (this.isNew && this.versionHistory.length === 0) {
    this.versionHistory.push({
      title: this.title,
      category: this.category,
      body: this.body,
      updatedAt: new Date(),
    });
  }
});

const Blog = model("blog", blogSchema);
module.exports = Blog;
