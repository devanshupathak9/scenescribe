// Curated motions for "Debate with AI". Served by GET /api/debate/topics so the
// list can be updated without redeploying the web app.
// level: the lowest level the motion works well for.

module.exports = [
  // Everyday life
  { id: 'remote-work', category: 'Work & Career', level: 'beginner', motion: 'Working from home is better than working in an office' },
  { id: 'four-day-week', category: 'Work & Career', level: 'intermediate', motion: 'Companies should switch to a four-day work week' },
  { id: 'degree-needed', category: 'Work & Career', level: 'intermediate', motion: 'A college degree is no longer necessary for a successful career' },
  { id: 'gig-economy', category: 'Work & Career', level: 'advanced', motion: 'The gig economy does more harm than good to workers' },

  { id: 'phones-school', category: 'Education', level: 'beginner', motion: 'Mobile phones should be banned in schools' },
  { id: 'homework', category: 'Education', level: 'beginner', motion: 'Students should not be given homework' },
  { id: 'online-learning', category: 'Education', level: 'intermediate', motion: 'Online learning is as effective as classroom learning' },
  { id: 'english-medium', category: 'Education', level: 'advanced', motion: 'All higher education should be taught in English' },

  { id: 'social-media-good', category: 'Technology', level: 'beginner', motion: 'Social media does more good than harm' },
  { id: 'ai-jobs', category: 'Technology', level: 'intermediate', motion: 'Artificial intelligence will create more jobs than it destroys' },
  { id: 'cashless', category: 'Technology', level: 'intermediate', motion: 'Our country should become a completely cashless society' },
  { id: 'social-media-age', category: 'Technology', level: 'advanced', motion: 'Children under 16 should be banned from social media' },

  { id: 'city-village', category: 'Lifestyle', level: 'beginner', motion: 'Living in a city is better than living in a village' },
  { id: 'cooking-home', category: 'Lifestyle', level: 'beginner', motion: 'Cooking at home is better than eating out' },
  { id: 'pets', category: 'Lifestyle', level: 'beginner', motion: 'Every family should have a pet' },
  { id: 'travel-young', category: 'Lifestyle', level: 'intermediate', motion: 'Young people should travel before starting their careers' },

  { id: 'plastic-ban', category: 'Environment', level: 'beginner', motion: 'Single-use plastic should be banned completely' },
  { id: 'electric-cars', category: 'Environment', level: 'intermediate', motion: 'Petrol cars should be banned by 2035' },
  { id: 'meat-tax', category: 'Environment', level: 'advanced', motion: 'Governments should tax meat to fight climate change' },

  { id: 'sports-school', category: 'Society', level: 'beginner', motion: 'Sports should be compulsory in schools' },
  { id: 'voting-age', category: 'Society', level: 'intermediate', motion: 'The voting age should be lowered to 16' },
  { id: 'celebrities', category: 'Society', level: 'intermediate', motion: 'Celebrities are good role models for young people' },
  { id: 'space', category: 'Society', level: 'advanced', motion: 'Money spent on space exploration would be better spent on Earth' },
];
