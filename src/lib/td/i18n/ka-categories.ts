/** The Categories page: Quizball's category grid, form and delete confirmation, for the two rounds that have categories. */
export const KA_CATEGORIES: Record<string, string> = {
  // tabs/categories-tab.tsx
  'Manage and explore different football categories.': 'მართეთ და დაათვალიერეთ ფეხბურთის სხვადასხვა კატეგორია.',
  'Search categories...': 'კატეგორიების ძებნა...',
  'New Category': 'ახალი კატეგორია',
  'Create Category': 'კატეგორიის შექმნა',
  'Edit Category': 'კატეგორიის რედაქტირება',
  'Define a new content bucket for your questions.': 'განსაზღვრეთ ახალი კატეგორია თქვენი კითხვებისთვის.',
  'Update the category details below.': 'განაახლეთ კატეგორიის მონაცემები ქვემოთ.',

  // categories/td-category-list.tsx
  'Failed to load categories. Please try again.': 'კატეგორიების ჩატვირთვა ვერ მოხერხდა. სცადეთ ხელახლა.',
  'No categories found': 'კატეგორია ვერ მოიძებნა',
  'Try searching for something else': 'სცადეთ სხვა სიტყვით ძებნა',

  // categories/td-category-card.tsx, td-category-preview.tsx
  '{count} cards': '{count} ბარათი',
  '{count} questions': '{count} კითხვა',

  // categories/td-category-form.tsx
  'Category name': 'კატეგორიის სახელი',
  'Save as Draft': 'დრაფტად შენახვა',
  'Save Changes': 'ცვლილებების შენახვა',
  'Saving…': 'ინახება…',
  'Category created successfully': 'კატეგორია წარმატებით შეიქმნა',
  'Category updated successfully': 'კატეგორია წარმატებით განახლდა',

  // categories/td-category-questions.tsx
  'Cards ({n})': 'ბარათები ({n})',
  'Questions ({n})': 'კითხვები ({n})',
  'No cards in this category yet.': 'ამ კატეგორიაში ბარათები ჯერ არ არის.',
  'No questions in this category yet.': 'ამ კატეგორიაში კითხვები ჯერ არ არის.',

  // categories/td-category-delete-modal.tsx
  'Delete Category: "{name}"': 'კატეგორიის წაშლა: „{name}“',
  'Are you sure you want to delete this category? It leaves the game at the next publish. Nothing is lost: it moves to Archived at the bottom of the page, and a publisher can restore it.':
    'ნამდვილად გსურთ ამ კატეგორიის წაშლა? თამაშიდან ის მომდევნო გამოქვეყნებისას ამოვა. არაფერი იკარგება: კატეგორია გადავა გვერდის ბოლოს, განყოფილებაში „დაარქივებული“, და გამომქვეყნებელს შეუძლია მისი აღდგენა.',
  'Deleting...': 'იშლება...',
};
