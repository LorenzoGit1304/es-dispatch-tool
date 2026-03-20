exports.up = (pgm) => {
  pgm.addColumn("enrollments", {
    language: {
      type: "VARCHAR(50)",
      notNull: false,
    },
  }, {
    ifNotExists: true,
  });

  pgm.sql(`
    UPDATE enrollments
    SET language = 'English'
    WHERE language IS NULL;
  `);

  pgm.alterColumn("enrollments", "language", {
    type: "VARCHAR(50)",
    notNull: true,
    default: "English",
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("enrollments", "language", {
    ifExists: true,
  });
};
