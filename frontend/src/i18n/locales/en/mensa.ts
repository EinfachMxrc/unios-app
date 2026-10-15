// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  noPhoto: 'No photo yet',
  previousDay: 'Previous day',
  nextDay: 'Next day',
  todayButton: 'Today',
  chooseDay: 'Choose date',
  noMatchingMeals: 'No labelled meals match your diet today. Select “Everything” to see the full menu.',
  allergenDetails: 'Allergens & additives',
  categories: {
    main: 'Main dishes',
    vegan: 'Vegan buffet',
    side: 'Side dishes',
    dessert: 'Desserts',
    salad: 'Salads & snacks',
    pasta_counter: 'Pasta counter',
    food_truck: 'Food truck',
    night: 'Evening menu',
    other: 'Other dishes',
  },
  loading: 'Loading menu …',
  dietPreference: 'Diet',
  dietAll: 'Everything · no preference',
  dietVegetarian: 'Vegetarian',
  dietVegan: 'Vegan',
  dietPescatarian: 'Vegetarian + fish',
  dietHint:
    'Only meals with matching labels from the official menu are shown. Choose “Everything” to include unlabelled meals.',
  preferredMeal: 'Matches your preference',
  mealVegan: 'Vegan',
  mealVegetarian: 'Vegetarian',
  mealFish: 'Contains fish',
  mealMeat: 'Contains meat',

  title: 'Canteen & menu',

  subtitle: 'Your university’s official menu.',

  canteen: 'Canteen',

  day: 'Date',

  break: 'Lunch break starts at',

  lead: 'Show before lunch',

  lead60: '1 hour before',

  lead90: '1½ hours before',

  lead120: '2 hours before',

  enabled: 'Show on Today',

  save: 'Save settings',

  saved: 'Saved on this device.',

  saveError: 'Settings could not be saved.',

  preview: 'Lunch at {{time}} · Shown from {{reminder}}',

  plan: 'Menu',

  today: 'Today’s canteen menu',

  all: 'Open menu',

  source: 'Official menu',

  empty: 'No meals have been published for this day yet.',

  unconfigured: 'No menu has been configured for your university yet.',

  stale: 'Saved menu – unable to refresh right now.',

  fetched: 'Updated: {{time}}',

  price: 'Student price',

  allergens: 'Allergens / additives from the provider: {{codes}}. See the official menu for the legend.',

  intro: 'Choose your canteen and lunch break. The Today card appears at least one hour beforehand.',

  setup: 'Set lunch break',

  retry: 'Reload',

  mailTitle: 'University mailbox',

  mailIntro:
    'Open your official Outlook mailbox in a separate UniOS window. Sign in there yourself; UniOS does not read your password or verification code.',

  mailOpen: 'Open Outlook',

  mailBrowser: 'Open official mailbox',

  mailUnavailable: 'Your university has not configured an official mailbox link yet.',

  mailOpened: 'Mailbox opened. Sign in in the Outlook window.',

  mailNotice:
    'Opening Outlook does not automatically import emails. You can check individual messages for deadlines below.',

  mailEnable: 'Add university mail to the sidebar',

  areas: 'Areas',
} as const
