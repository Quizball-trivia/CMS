/** The question upload dialog of the Questions page and the messages of the files it reads
 *  (components/td/questions/td-bulk-upload-dialog.tsx, lib/td/upload-format.ts). */
export const KA_UPLOAD: Record<string, string> = {
  // The dialog
  'Bulk Upload Questions': 'კითხვების ერთიანი ატვირთვა',
  'Upload a .txt file with multiple questions to create them all at once. Maximum {max} questions per upload.':
    'ატვირთეთ .txt ფაილი, რომელშიც რამდენიმე კითხვაა, რომ ყველა ერთდროულად შეიქმნას. ერთ ატვირთვაში დასაშვებია მაქსიმუმ {max} კითხვა.',
  'Creating {count} questions…': 'იქმნება {count} კითხვა…',
  'Checking {count} questions…': 'მოწმდება {count} კითხვა…',
  'Question Type': 'თამაშის რეჟიმი',
  'Select a question type': 'აირჩიეთ თამაშის რეჟიმი',
  'Controls the parser and saved question payload.': 'განსაზღვრავს, როგორ იკითხება ფაილი და რა ინახება.',
  'Select a category': 'აირჩიეთ კატეგორია',
  'New category…': 'ახალი კატეგორია…',
  'Loading categories...': 'კატეგორიები იტვირთება…',
  'No categories available': 'კატეგორიები არ არის',
  'New category key': 'ახალი კატეგორიის გასაღები',
  'Question File': 'ფაილი კითხვებით',
  'Upload a .txt file (max {mb} MB)': 'ატვირთეთ .txt ფაილი (მაქსიმუმ {mb} MB)',
  'File Format': 'ფაილის ფორმატი',
  'Required format for each question:': 'თითოეული კითხვის სავალდებულო ფორმატი:',
  'Uploading...': 'იტვირთება…',

  // What the file format says about each mode
  'Points is 1, 2 or 3. Optional: “Image: messi-portrait” gives the key of an image already uploaded, and “Photo: 158023 | 25_1” a SoFIFA player id and version. Images are not uploaded here.':
    'Points არის 1, 2 ან 3. არასავალდებულოა: „Image: messi-portrait“ უკვე ატვირთული სურათის ID-ა, ხოლო „Photo: 158023 | 25_1“ — SoFIFA-ს მოთამაშის ID და ვერსია. სურათები აქ არ იტვირთება.',
  'Optional: “Image: dinamo-stadium” gives the key of an image already uploaded. Images are not uploaded here.':
    'არასავალდებულოა: „Image: dinamo-stadium“ უკვე ატვირთული სურათის ID-ა. სურათები აქ არ იტვირთება.',
  'Every club needs a name before its = (Name=club-key)': 'ყველა კლუბს = ნიშნამდე სახელი სჭირდება (სახელი=კლუბის-გასაღები)',

  // Reading the file
  'Please select a .txt file': 'აირჩიეთ .txt ფაილი',
  'File size must be less than {mb} MB': 'ფაილი უნდა იყოს {mb} MB-ზე ნაკლები',
  'Failed to read file': 'ფაილის წაკითხვა ვერ მოხერხდა',
  'No valid questions found in file': 'ფაილში სწორი კითხვები ვერ მოიძებნა',
  'Read {n} questions: {errors}, {warnings}': 'წაკითხულია {n} კითხვა: {errors}, {warnings}',
  'Read {count} questions': 'წაკითხულია {count} კითხვა',
  '{count} errors': '{count} შეცდომა',
  '{count} warnings': '{count} გაფრთხილება',
  'Found {count} issues in file': 'ფაილში ნაპოვნია {count} ხარვეზი',
  'Fix the file and choose it again: nothing is uploaded while it has errors.': 'გაასწორეთ ფაილი და თავიდან აირჩიეთ: სანამ მასში შეცდომებია, არაფერი აიტვირთება.',
  'error [upload]': 'შეცდომა',
  'warning [upload]': 'გაფრთხილება',
  'Question {n}': 'კითხვა {n}',
  '...and {n} more': '…და კიდევ {n}',

  // The list and its check
  'Parsed Questions ({n})': 'წაკითხული კითხვები ({n})',
  'Maximum {max} questions allowed': 'დასაშვებია მაქსიმუმ {max} კითხვა',
  '{count} questions selected for upload': 'ასატვირთად მონიშნულია {count} კითხვა',
  '{count} duplicates found and unselected.': 'ნაპოვნია {count} დუბლიკატი, მონიშვნა მოხსნილია.',
  'No file chosen': 'ფაილი არჩეული არ არის',
  '{count} pictures': '{count} სურათი',
  'The API takes 30 pictures a minute: the rest go up in a moment.': 'API წუთში 30 სურათს იღებს: დანარჩენი ცოტა ხანში აიტვირთება.',
  '{count} questions have problems: remove them or fix the file': '{count} კითხვას ხარვეზი აქვს: წაშალეთ ისინი ან გაასწორეთ ფაილი',
  'Duplicate [upload]': 'დუბლიკატი',
  'Problem [upload]': 'ხარვეზი',
  'Exists already': 'უკვე არსებობს',
  'Not valid': 'არასწორია',
  'Repeated in this upload': 'ამ ატვირთვაში მეორდება',
  'Refers to something that does not exist': 'მიუთითებს არარსებულზე',
  'Not allowed': 'დაუშვებელია',
  'Page {page} of {total}': 'გვერდი {page} / {total}',
  'Upload {count} Questions': '{count} კითხვის ატვირთვა',
  'Failed to check the questions. You can still proceed with upload.': 'კითხვების შემოწმება ვერ მოხერხდა. ატვირთვის გაგრძელება მაინც შეგიძლიათ.',
  'No questions selected for upload': 'ასატვირთად კითხვა არ არის მონიშნული',
  'Please select a category': 'აირჩიეთ კატეგორია',

  // The preview of one question
  'Question Preview': 'კითხვის გადახედვა',
  '{n} of {total}': '{n} / {total}',
  'Selected [upload]': 'მონიშნულია',
  'Not Selected': 'მონიშნული არ არის',
  'Question #{n}': 'კითხვა №{n}',
  'Clues ({n})': 'მინიშნებები ({n})',
  'Clue {n}:': 'მინიშნება {n}:',
  '{id} · version {ver}': '{id} · ვერსია {ver}',
  'Options [upload]': 'სავარაუდო პასუხები',
  'Explanation [upload]': 'განმარტება',
  'No uploaded image has this key': 'ამ ID-ით ატვირთული სურათი არ არის',
  'This question already exists.': 'ეს კითხვა უკვე არსებობს.',
  'This question has problems:': 'ამ კითხვას ხარვეზები აქვს:',

  // The messages about a file's lines (lib/td/upload-format.ts)
  'Duplicate question number {n}': 'კითხვის ნომერი მეორდება: {n}',
  'Expected question number {expected}, found {n}': 'მოსალოდნელი კითხვის ნომერი იყო {expected}, მოიძებნა {n}',
  'Content found before the first numbered question': 'პირველ დანომრილ კითხვამდე ტექსტი მოიძებნა',
  'Missing the “{label}” line': 'აკლია სტრიქონი „{label}“',
  'The “{label}” line is empty': 'სტრიქონი „{label}“ ცარიელია',
  'More than one “{label}” line': 'სტრიქონი „{label}“ ერთზე მეტია',
  'This line is not part of the format and is ignored: {text}': 'ეს სტრიქონი ფორმატს არ ეკუთვნის და გამოტოვებულია: {text}',
  'Missing question text': 'კითხვის ტექსტი არ არის',
  'Needs exactly one question line before the answer': 'პასუხამდე საჭიროა ზუსტად ერთი კითხვის სტრიქონი',
  'Needs at least one clue line': 'საჭიროა მინიმუმ ერთი მინიშნების სტრიქონი',
  'At most {max} clue lines': 'მაქსიმუმ {max} მინიშნების სტრიქონი',
  'Clues must be numbered sequentially starting from 1': 'მინიშნებები უნდა დაინომროს თანმიმდევრულად, 1-დან',
  'Missing points (use “Points: 1”, “Points: 2” or “Points: 3”)': 'ქულა არ არის მითითებული (გამოიყენეთ „Points: 1“, „Points: 2“ ან „Points: 3“)',
  'Points must be 1, 2 or 3': 'ქულა უნდა იყოს 1, 2 ან 3',
  'The cards of this category could not be read, so nothing can be uploaded into it yet.': 'ამ კატეგორიის ბარათები ვერ წაიკითხა, ამიტომ მასში ჯერ ვერაფერი აიტვირთება.',
  'Two cards in this category have this name: change the one meant on its own page': 'ამ კატეგორიაში ორ ბარათს აქვს ეს სახელი: საჭირო ბარათი მის გვერდზე შეცვალეთ',
  'A photo is a SoFIFA player number and its two-digit version, such as “158023 | 24”': 'ფოტო არის SoFIFA-ს მოთამაშის ნომერი და ორნიშნა ვერსია, მაგალითად „158023 | 24“',
  'Must have between 2 and 8 options (A, B, C…), found {n}': 'უნდა იყოს 2-დან 8-მდე ვარიანტი (A, B, C…), მოიძებნა {n}',
  'Options must be lettered A, B, C… in order': 'ვარიანტები უნდა აღინიშნოს თანმიმდევრობით: A, B, C…',
  'No correct answer marked (use * after the correct option)': 'სწორი პასუხი მონიშნული არ არის (სწორი ვარიანტის ბოლოს დაწერეთ *)',
  'Multiple correct answers marked (only one allowed)': 'მონიშნულია რამდენიმე სწორი პასუხი (დასაშვებია მხოლოდ ერთი)',
  'Missing difficulty level (use “Difficulty: Easy/Medium/Hard”)': 'სირთულე არ არის მითითებული (გამოიყენეთ „Difficulty: Easy/Medium/Hard“)',
  'Difficulty must be Easy, Medium or Hard': 'სირთულე უნდა იყოს Easy, Medium ან Hard',
  'Missing Items section': 'აკლია სექცია Items',
  'Missing Answer section': 'აკლია სექცია Answer',
  'Put in Order needs between 2 and 12 items, found {n}': '„დაალაგე სწორად“-ში უნდა იყოს 2-დან 12-მდე ელემენტი, მოიძებნა {n}',
  'Answer item count must match item count': 'Answer-ში ელემენტების რაოდენობა Items-ის რაოდენობას უნდა ემთხვეოდეს',
  'Items must be different from each other': 'ელემენტები ერთმანეთისგან განსხვავებული უნდა იყოს',
  'Each item appears once in the Answer': 'თითოეული ელემენტი Answer-ში ერთხელ უნდა იყოს',
  'Answer item “{item}” does not match any listed item': 'Answer-ის ელემენტი „{item}“ არც ერთ ჩამოწერილ ელემენტს არ ემთხვევა',
  'Career Path questions need at least 2 clubs separated by arrows': '„კარიერის გზის“ კითხვაში უნდა იყოს მინიმუმ 2 კლუბი, ისრებით გამოყოფილი',
  'At most {max} clubs': 'მაქსიმუმ {max} კლუბი',

  // Pictures and cards already in the category
  'Answer: the first name is what the card shows. Add others only for nicknames or a very different spelling: the game already forgives typos, accents, capitals and Georgian or Latin letters, and the surname alone counts.':
    'Answer: პირველი სახელი ბარათზე ჩანს. სხვები დაამატეთ მხოლოდ მეტსახელისთვის ან სულ სხვა დაწერილობისთვის: თამაში ისედაც ითმენს შეცდომებს, აქცენტებს, დიდ ასოებს და ქართულ ან ლათინურ ასოებს, გვარიც საკმარისია.',
  'Choose the picture {name} under Pictures': 'სურათებში აირჩიეთ {name}',
  'The picture {name} could not be saved: {error}': 'სურათი {name} ვერ შეინახა: {error}',
  'The card {name} was not updated: {error}': 'ბარათი {name} ვერ განახლდა: {error}',
  Author: 'ავტორი',
  'Updates the card': 'ბარათს განაახლებს',
  '{count} cards updated': 'განახლდა {count} ბარათი',
  '{count} of them update cards already in the category': 'მათგან {count} კატეგორიაში უკვე არსებულ ბარათს განაახლებს',
  'Topic': 'თემა',
  'A Credit line goes with an Image line that names a picture file (buffon.jpg)': 'Credit ხაზი უნდა ახლდეს Image ხაზს, რომელიც სურათის ფაილს ასახელებს (buffon.jpg)',
  'A Credit line is “author | licence | source”': 'Credit ხაზი ასეთია: „ავტორი | ლიცენზია | წყარო“',
  'Question {n} updates the same card': 'კითხვა {n} იმავე ბარათს ანახლებს',
  'The same question as question {n} of this file: remove one of them': 'იგივე კითხვაა, რაც ამ ფაილის კითხვა {n}: ერთ-ერთი წაშალეთ',
  'The same question as question {n} of this file, with another picture: remove one of them': 'იგივე კითხვაა, რაც ამ ფაილის კითხვა {n}, მხოლოდ სხვა სურათით: ერთ-ერთი წაშალეთ',
  'A new card needs a clue line or a picture': 'ახალ ბარათს მინიშნება ან სურათი სჭირდება',
  'A question needs its text or a picture': 'კითხვას ტექსტი ან სურათი სჭირდება',
  'The sign-in changed, so the upload stopped. Check the cards before you upload again.': 'შესვლა შეიცვალა, ამიტომ ატვირთვა შეჩერდა. ხელახლა ატვირთვამდე ბარათები გადაამოწმეთ.',
  'The images could not be loaded to check this key. Close the upload and open it again.': 'სურათები ვერ ჩაიტვირთა ამ ID-ის შესამოწმებლად. დახურეთ ატვირთვა და ხელახლა გახსენით.',
  'Choose one .txt file, with its pictures if it names any': 'აირჩიეთ ერთი .txt ფაილი და, თუ ასახელებს, მისი სურათები',
  'The .txt file (max {mb} MB), and the pictures it names: choose them together.': '.txt ფაილი (მაქს. {mb} MB) და მასში დასახელებული სურათები: აირჩიეთ ერთად.',
  'Pictures': 'სურათები',
  'Picture': 'სურათი',
  'The file names {count} pictures not chosen yet: {names}. Choose them here.': 'ფაილი ასახელებს {count} სურათს, რომლებიც ჯერ არ არის არჩეული: {names}. აირჩიეთ აქ.',
  'Round II needs at least 5 clues: a match shows the first 5': 'II ტურს მინიმუმ 5 მინიშნება სჭირდება: მატჩში პირველი 5 ჩანს',
  'Five clues per player, hardest first: a match shows the first 5, one every few seconds, and the first to buzz answers. No points and no pictures in this round.': 'თითო მოთამაშეზე ხუთი მინიშნება, ყველაზე რთულით დაწყებული: მატჩში პირველი 5 ჩანს, რამდენიმე წამში ერთი, და ვინც პირველი დააჭერს, ის პასუხობს. ამ ტურში ქულები და სურათები არ არის.',
  'Answer (question {n})': 'პასუხი (კითხვა №{n})',
  'An image path starts with / and has no spaces':
    'სურათის მისამართი /-ით იწყება და გამოტოვებებს არ შეიცავს',
  'Optional: “Image: stadium.jpg” is the file name of a picture chosen below under Pictures, “Image: https://…” a link to a picture (the CMS downloads it and keeps its own copy), or the key of an image already uploaded.':
    'არასავალდებულო: „Image: stadium.jpg“ ქვემოთ, სურათებში არჩეული ფაილის სახელია, „Image: https://…“ სურათის ბმული (CMS მას ჩამოტვირთავს და საკუთარ ასლს ინახავს), ან უკვე ატვირთული სურათის გასაღები.',
  'An image is the file name of a picture chosen with the file (buffon.jpg), a link to a picture (https://…), or the key of an image already uploaded':
    'სურათი არის ფაილთან ერთად არჩეული სურათის სახელი (buffon.jpg), სურათის ბმული (https://…) ან უკვე ატვირთული სურათის გასაღები',
  'A picture link is a web address starting with https://, with no spaces':
    'სურათის ბმული https://-ით დაწყებული ვებმისამართია, გამოტოვებების გარეშე',
  'The pictures the file names on its Image lines: JPEG, PNG or WebP, at most 2 MB each. Pictures chosen again are added. An Image line with a link needs nothing here: its picture is downloaded.':
    'სურათები, რომლებსაც ფაილი Image ხაზებზე ასახელებს: JPEG, PNG ან WebP, თითო მაქსიმუმ 2 MB. ხელახლა არჩეული სურათები ემატება. ბმულიან Image ხაზს აქ არაფერი სჭირდება: მისი სურათი ავტომატურად ჩამოიტვირთება.',
  'Downloading {count} picture from its link…':
    'ბმულიდან ჩამოიტვირთება {count} სურათი…',
  'Downloading {count} pictures from their links…':
    'ბმულიდან ჩამოიტვირთება {count} სურათი…',
  'A picture could not be downloaded from its link: save it and choose it here, or give another link.':
    'ერთი სურათი ბმულიდან ვერ ჩამოიტვირთა: შეინახეთ და აქ აირჩიეთ, ან სხვა ბმული მიუთითეთ.',
  '{count} pictures could not be downloaded from their links: save them and choose them here, or give other links.':
    '{count} სურათი ბმულიდან ვერ ჩამოიტვირთა: შეინახეთ და აქ აირჩიეთ, ან სხვა ბმული მიუთითეთ.',
  'The picture at its link could not be downloaded: {reason}':
    'სურათი ბმულიდან ვერ ჩამოიტვირთა: {reason}',
  'Downloading the picture from its link…':
    'სურათი ბმულიდან ჩამოიტვირთება…',
  'From a link':
    'ბმულიდან',
  'this is not a web address the CMS can download from':
    'ეს ისეთი ვებმისამართი არაა, საიდანაც CMS ჩამოტვირთვას შეძლებს',
  'this address cannot be downloaded from':
    'ამ მისამართიდან ჩამოტვირთვა დაუშვებელია',
  'the site did not answer':
    'საიტმა არ უპასუხა',
  'the site is busy: try again in a minute':
    'საიტი გადატვირთულია: ერთ წუთში სცადეთ ხელახლა',
  'the site has no picture at this link':
    'ამ ბმულზე საიტს სურათი არ აქვს',
  'the picture is bigger than 2 MB':
    'სურათი 2 MB-ზე დიდია',
  'the link is not a JPEG, PNG or WebP picture (open the picture itself and copy its address)':
    'ბმული JPEG, PNG ან WebP სურათი არაა (გახსენით თავად სურათი და მისი მისამართი დააკოპირეთ)',
  'sign in again to download pictures':
    'სურათების ჩამოსატვირთად ხელახლა შედით სისტემაში',
  'the download failed':
    'ჩამოტვირთვა ვერ მოხერხდა',
  'A category has 1 to {max} characters':
    'კატეგორია 1-დან {max} სიმბოლომდეა',
  'Optional: “Category: ოქროს ბურთი” gives the question its own category instead of the one chosen above. When every question has one, no category needs to be chosen.':
    'არასავალდებულო: „Category: ოქროს ბურთი“ კითხვას საკუთარ კატეგორიას აძლევს ზემოთ არჩეულის ნაცვლად. თუ ყველა კითხვას აქვს, კატეგორიის არჩევა საჭირო აღარ არის.',
  'Optional: “Category: მუნდიალი” puts the question in that category, and the upload makes the category when there is none of that name. When every question has one, no category needs to be chosen.':
    'არასავალდებულო: „Category: მუნდიალი“ კითხვას ამ კატეგორიაში სვამს. თუ ასეთი სახელის კატეგორია ჯერ არ არსებობს, ატვირთვა თვითონ შექმნის. თუ ყველა კითხვას აქვს, ზემოთ კატეგორიის არჩევა საჭირო აღარ არის.',
  'Penalty questions have no category: remove this line': 'პენალტის კითხვებს კატეგორია არ აქვს: წაშალე ეს სტრიქონი',
  'The one chosen above': 'ზემოთ არჩეული',
  'new': 'ახალი',
  'new category: the upload makes it': 'ახალი კატეგორია: ატვირთვა შექმნის',
  'They were uploaded before and are in the CMS already: find them in the Questions list under {mode}.': 'ისინი უკვე ატვირთულია და CMS-შია: ნახე კითხვების სიაში, „{mode}“.',
};
