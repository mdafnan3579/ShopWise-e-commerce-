import { PRODUCT_IMAGES } from './productImages.js';

/**
 * Seed catalog: 48 products across 8 categories. `quality` (1–5) biases the generated review
 * ratings so the catalog has a realistic spread of good and mediocre products.
 * Prices are integer cents.
 */
export const SEED_PRODUCTS = [
  // --- Electronics ---
  {
    name: 'Aurora ANC Wireless Headphones',
    brand: 'Sonora',
    category: 'electronics',
    priceCents: 19999,
    stock: 42,
    quality: 4.6,
    tags: ['wireless', 'noise-cancelling', 'bluetooth', 'over-ear', 'travel'],
    tagline: 'Silence the world. Keep the music.',
    description:
      'Over-ear Bluetooth headphones with adaptive active noise cancellation, 40-hour battery life and fast charging (10 minutes for 5 hours of playback). Plush memory-foam ear cushions and a foldable design make them ideal for long flights and daily commutes.',
  },
  {
    name: 'Pulse Mini Bluetooth Speaker',
    brand: 'Sonora',
    category: 'electronics',
    priceCents: 4999,
    stock: 120,
    quality: 4.3,
    tags: ['bluetooth', 'waterproof', 'portable', 'speaker', 'outdoor'],
    tagline: 'Big sound that fits in your palm.',
    description:
      'A rugged, IP67 waterproof and dustproof speaker with 360-degree sound, 12-hour battery and a built-in strap. Pair two for stereo. Survives drops, sand and the occasional pool dive.',
  },
  {
    name: 'Nimbus 14 Ultrabook',
    brand: 'Vertex',
    category: 'electronics',
    priceCents: 109900,
    stock: 8,
    quality: 4.5,
    tags: ['laptop', 'ultrabook', 'lightweight', 'work', 'student'],
    tagline: 'All-day power at 1.2 kg.',
    description:
      'A 14-inch ultrabook with a 2.8K 120Hz display, 16 GB RAM, 512 GB SSD and up to 18 hours of battery life. Aluminium unibody, backlit keyboard, two USB-C ports with charging and a 1080p webcam with privacy shutter.',
  },
  {
    name: 'Orbit Smartwatch S2',
    brand: 'Vertex',
    category: 'electronics',
    priceCents: 24900,
    stock: 3,
    quality: 3.9,
    tags: ['smartwatch', 'fitness', 'gps', 'heart-rate', 'waterproof'],
    tagline: 'Your health, at a glance.',
    description:
      'AMOLED smartwatch with built-in GPS, heart-rate and SpO2 monitoring, sleep tracking and 100+ workout modes. Water resistant to 50 m with a 7-day battery. Works with iOS and Android.',
  },
  {
    name: 'Lumen 4K Streaming Webcam',
    brand: 'Clarity',
    category: 'electronics',
    priceCents: 12999,
    stock: 34,
    quality: 4.1,
    tags: ['webcam', '4k', 'streaming', 'work-from-home', 'usb-c'],
    tagline: 'Look your best on every call.',
    description:
      '4K webcam with HDR, auto-framing and dual noise-reducing microphones. Low-light correction keeps you sharp in dim rooms. Plug-and-play over USB-C, with a magnetic privacy cover.',
  },
  {
    name: 'VoltCharge 65W GaN Charger',
    brand: 'Clarity',
    category: 'electronics',
    priceCents: 3999,
    stock: 210,
    quality: 4.7,
    tags: ['charger', 'usb-c', 'gan', 'travel', 'fast-charging'],
    tagline: 'One charger for laptop, phone and tablet.',
    description:
      'A compact 65W gallium-nitride charger with two USB-C ports and one USB-A port. Charges a laptop and phone simultaneously and is 40% smaller than standard chargers. Foldable plug for travel.',
  },

  // --- Clothing ---
  {
    name: 'Northpeak Stormshell Rain Jacket',
    brand: 'Northpeak',
    category: 'clothing',
    priceCents: 15999,
    stock: 27,
    quality: 4.5,
    tags: ['waterproof', 'jacket', 'hiking', 'breathable', 'packable'],
    tagline: 'Stay dry when the forecast lies.',
    description:
      'A 3-layer waterproof, breathable shell with fully taped seams, a helmet-compatible hood and pit zips for ventilation. Packs into its own chest pocket. Rated 20,000 mm waterproof.',
  },
  {
    name: 'Everyday Merino Crew Tee',
    brand: 'Woolly & Co',
    category: 'clothing',
    priceCents: 5900,
    stock: 85,
    quality: 4.4,
    tags: ['merino', 'tee', 'odor-resistant', 'travel', 'base-layer'],
    tagline: 'Wear it all week. Seriously.',
    description:
      'A lightweight 150 gsm merino wool t-shirt that regulates temperature and resists odor naturally. Soft against the skin with no itch, perfect for travel, hiking or the office.',
  },
  {
    name: 'Flex Tapered Chinos',
    brand: 'Urban Thread',
    category: 'clothing',
    priceCents: 6900,
    stock: 64,
    quality: 3.8,
    tags: ['chinos', 'stretch', 'office', 'casual', 'pants'],
    tagline: 'Office-ready, couch-comfortable.',
    description:
      'Tapered chinos in a cotton blend with 2% stretch for all-day comfort. Wrinkle-resistant finish, hidden zip pocket and a slim but not skinny fit.',
  },
  {
    name: 'Summit Fleece Hoodie',
    brand: 'Northpeak',
    category: 'clothing',
    priceCents: 7900,
    stock: 4,
    quality: 4.2,
    tags: ['fleece', 'hoodie', 'warm', 'outdoor', 'layering'],
    tagline: 'Warmth that goes anywhere.',
    description:
      'A grid-fleece hoodie that traps heat while staying breathable during activity. Fitted hood, thumb loops and a zippered chest pocket. Made with 80% recycled polyester.',
  },
  {
    name: 'Coastline Linen Shirt',
    brand: 'Urban Thread',
    category: 'clothing',
    priceCents: 5400,
    stock: 38,
    quality: 4.0,
    tags: ['linen', 'shirt', 'summer', 'breathable', 'casual'],
    tagline: 'Effortless summer style.',
    description:
      '100% European linen shirt with a relaxed fit and coconut buttons. Gets softer with every wash and keeps you cool in the heat.',
  },
  {
    name: 'Thermal Down Puffer Vest',
    brand: 'Northpeak',
    category: 'clothing',
    priceCents: 11900,
    stock: 0,
    quality: 4.3,
    tags: ['down', 'vest', 'winter', 'packable', 'warm'],
    tagline: 'Core warmth, zero bulk.',
    description:
      'A 700-fill responsibly sourced down vest that packs into its own pocket. Water-repellent shell, two zip hand pockets and a stretch-bound collar.',
  },

  // --- Shoes ---
  {
    name: 'Stride Trail Runner GTX',
    brand: 'Stride',
    category: 'shoes',
    priceCents: 8999,
    stock: 31,
    quality: 4.6,
    tags: ['running', 'trail', 'waterproof', 'grip', 'gore-tex'],
    tagline: 'Dry feet on every trail.',
    description:
      'A waterproof trail running shoe with a breathable membrane, aggressive 5 mm lugs and a rock plate for protection on technical terrain. Responsive foam midsole for long distances.',
  },
  {
    name: 'Stride Road Racer 3',
    brand: 'Stride',
    category: 'shoes',
    priceCents: 12999,
    stock: 22,
    quality: 4.4,
    tags: ['running', 'road', 'lightweight', 'racing', 'carbon'],
    tagline: 'Built for personal bests.',
    description:
      'A lightweight road racing shoe with a carbon-fiber plate and high-rebound foam. Engineered mesh upper locks your foot in for fast tempo runs and race day.',
  },
  {
    name: 'Cloudwalk Everyday Sneaker',
    brand: 'Cloudwalk',
    category: 'shoes',
    priceCents: 7499,
    stock: 76,
    quality: 4.1,
    tags: ['sneaker', 'casual', 'comfort', 'walking', 'everyday'],
    tagline: 'Like walking on clouds, all day.',
    description:
      'A minimalist leather sneaker with a cushioned, removable insole and a durable rubber cupsole. Clean design pairs with jeans or chinos.',
  },
  {
    name: 'Ridgeline Waterproof Hiking Boot',
    brand: 'Northpeak',
    category: 'shoes',
    priceCents: 16999,
    stock: 14,
    quality: 4.7,
    tags: ['hiking', 'boots', 'waterproof', 'ankle-support', 'leather'],
    tagline: 'Miles of comfort, mountains of grip.',
    description:
      'Full-grain leather hiking boot with a waterproof membrane, Vibram outsole and supportive ankle collar. Ready out of the box with minimal break-in.',
  },
  {
    name: 'Studio Training Shoe',
    brand: 'Stride',
    category: 'shoes',
    priceCents: 6999,
    stock: 2,
    quality: 3.6,
    tags: ['training', 'gym', 'crossfit', 'stable', 'indoor'],
    tagline: 'Stable for lifts, light for sprints.',
    description:
      'A versatile gym shoe with a flat, stable heel for lifting and a flexible forefoot for agility work. Durable toe wrap for rope climbs.',
  },
  {
    name: 'Drift Recovery Slides',
    brand: 'Cloudwalk',
    category: 'shoes',
    priceCents: 3499,
    stock: 140,
    quality: 4.5,
    tags: ['slides', 'recovery', 'comfort', 'summer', 'waterproof'],
    tagline: 'Your feet deserve a day off.',
    description:
      'Thick, shock-absorbing foam slides that reduce stress on feet and joints after workouts. Waterproof and easy to clean.',
  },

  // --- Home & Kitchen ---
  {
    name: 'Brewmaster Pour-Over Coffee Set',
    brand: 'Hearth',
    category: 'home-kitchen',
    priceCents: 5999,
    stock: 45,
    quality: 4.6,
    tags: ['coffee', 'pour-over', 'glass', 'gift', 'kitchen'],
    tagline: 'Café-quality coffee at home.',
    description:
      'Borosilicate glass dripper, reusable stainless-steel filter and 600 ml carafe. Brew a clean, aromatic cup in four minutes without paper filters.',
  },
  {
    name: 'ProChef 8" Chef Knife',
    brand: 'Hearth',
    category: 'home-kitchen',
    priceCents: 8900,
    stock: 33,
    quality: 4.8,
    tags: ['knife', 'chef', 'stainless-steel', 'cooking', 'gift'],
    tagline: 'The only knife you really need.',
    description:
      'Forged from high-carbon German stainless steel with a full tang and ergonomic handle. Holds a razor edge and comes with a protective sheath.',
  },
  {
    name: 'AirCrisp 5.5L Air Fryer',
    brand: 'Kitchenly',
    category: 'home-kitchen',
    priceCents: 11999,
    stock: 19,
    quality: 4.2,
    tags: ['air-fryer', 'appliance', 'healthy', 'cooking', 'family'],
    tagline: 'Crispy results with 90% less oil.',
    description:
      'A 5.5-liter air fryer with eight presets, a shake reminder and a dishwasher-safe non-stick basket. Big enough for a family meal.',
  },
  {
    name: 'Cast Iron Dutch Oven 5.5qt',
    brand: 'Hearth',
    category: 'home-kitchen',
    priceCents: 7999,
    stock: 5,
    quality: 4.7,
    tags: ['cast-iron', 'dutch-oven', 'enamel', 'cooking', 'oven-safe'],
    tagline: 'Slow-cooked perfection for generations.',
    description:
      'Enamelled cast iron Dutch oven that distributes heat evenly for braising, baking bread and soups. Oven-safe to 260°C and compatible with all stovetops.',
  },
  {
    name: 'Serene Linen Duvet Cover Set',
    brand: 'Nestwell',
    category: 'home-kitchen',
    priceCents: 13900,
    stock: 21,
    quality: 4.0,
    tags: ['bedding', 'linen', 'duvet', 'bedroom', 'breathable'],
    tagline: 'Sleep cool, wake rested.',
    description:
      'Stonewashed French linen duvet cover with two pillowcases. Breathable, temperature-regulating and softer with every wash. Queen size.',
  },
  {
    name: 'SmartBrew Programmable Kettle',
    brand: 'Kitchenly',
    category: 'home-kitchen',
    priceCents: 6499,
    stock: 0,
    quality: 3.7,
    tags: ['kettle', 'tea', 'temperature-control', 'appliance', 'kitchen'],
    tagline: 'The perfect temperature for every tea.',
    description:
      'Gooseneck electric kettle with variable temperature control, a keep-warm mode and a one-hour hold. Precise pour spout for pour-over coffee.',
  },

  // --- Sports & Outdoors ---
  {
    name: 'Basecamp 2-Person Tent',
    brand: 'Northpeak',
    category: 'sports-outdoors',
    priceCents: 22900,
    stock: 11,
    quality: 4.5,
    tags: ['tent', 'camping', 'backpacking', 'waterproof', 'lightweight'],
    tagline: 'Your home in the wild, at 1.8 kg.',
    description:
      'A freestanding, double-wall backpacking tent with two doors and two vestibules. Sets up in under five minutes and handles wind and rain with ease.',
  },
  {
    name: 'FlowGrip Yoga Mat 6mm',
    brand: 'Zenfit',
    category: 'sports-outdoors',
    priceCents: 4900,
    stock: 95,
    quality: 4.4,
    tags: ['yoga', 'mat', 'non-slip', 'fitness', 'eco-friendly'],
    tagline: 'Grip that holds, cushion that supports.',
    description:
      'A 6 mm natural rubber yoga mat with a non-slip polyurethane top layer and alignment markings. Free of PVC and toxic plasticizers.',
  },
  {
    name: 'HydroPeak Insulated Bottle 1L',
    brand: 'HydroPeak',
    category: 'sports-outdoors',
    priceCents: 3499,
    stock: 160,
    quality: 4.6,
    tags: ['water-bottle', 'insulated', 'stainless-steel', 'hiking', 'gym'],
    tagline: 'Cold for 24 hours. Hot for 12.',
    description:
      'Double-wall vacuum insulated stainless steel bottle with a leak-proof lid and a powder-coated, sweat-free grip. BPA-free and dishwasher safe.',
  },
  {
    name: 'Adjustable Dumbbell Pair 24kg',
    brand: 'Zenfit',
    category: 'sports-outdoors',
    priceCents: 29900,
    stock: 6,
    quality: 4.3,
    tags: ['dumbbells', 'strength', 'home-gym', 'adjustable', 'fitness'],
    tagline: 'A full rack of weights in two dumbbells.',
    description:
      'Quick-dial adjustable dumbbells from 2 to 24 kg each, replacing 15 pairs of weights. Compact tray keeps your floor clear.',
  },
  {
    name: 'TrailLite Daypack 22L',
    brand: 'Northpeak',
    category: 'sports-outdoors',
    priceCents: 8900,
    stock: 28,
    quality: 4.2,
    tags: ['backpack', 'hiking', 'daypack', 'water-resistant', 'travel'],
    tagline: 'Everything you need for the day ahead.',
    description:
      'A 22-liter daypack with a ventilated back panel, hydration sleeve, hip belt pockets and a water-resistant finish. Weighs just 680 g.',
  },
  {
    name: 'Velocity Jump Rope',
    brand: 'Zenfit',
    category: 'sports-outdoors',
    priceCents: 1999,
    stock: 3,
    quality: 3.8,
    tags: ['jump-rope', 'cardio', 'fitness', 'speed', 'portable'],
    tagline: 'Cardio that fits in your pocket.',
    description:
      'A ball-bearing speed rope with an adjustable steel cable and comfortable aluminium handles. Smooth, fast rotations for double-unders.',
  },

  // --- Beauty ---
  {
    name: 'Glow Vitamin C Serum',
    brand: 'Lumière',
    category: 'beauty',
    priceCents: 3200,
    stock: 70,
    quality: 4.3,
    tags: ['skincare', 'serum', 'vitamin-c', 'brightening', 'vegan'],
    tagline: 'Brighter skin in four weeks.',
    description:
      '15% stabilized vitamin C with hyaluronic acid and ferulic acid to brighten, even skin tone and protect against environmental stress. Fragrance-free and vegan.',
  },
  {
    name: 'Hydra Daily Moisturizer SPF 30',
    brand: 'Lumière',
    category: 'beauty',
    priceCents: 2800,
    stock: 88,
    quality: 4.1,
    tags: ['skincare', 'moisturizer', 'spf', 'sunscreen', 'daily'],
    tagline: 'Hydration and protection in one step.',
    description:
      'Lightweight daily moisturizer with broad-spectrum SPF 30, niacinamide and ceramides. Absorbs quickly with no white cast.',
  },
  {
    name: 'Silk Repair Hair Mask',
    brand: 'Maison Belle',
    category: 'beauty',
    priceCents: 2400,
    stock: 4,
    quality: 4.4,
    tags: ['haircare', 'hair-mask', 'repair', 'argan-oil', 'dry-hair'],
    tagline: 'Salon-soft hair in ten minutes.',
    description:
      'An intensive weekly treatment with argan oil and keratin that repairs dry, damaged hair and reduces breakage. Sulfate- and paraben-free.',
  },
  {
    name: 'Pro Ionic Hair Dryer',
    brand: 'Maison Belle',
    category: 'beauty',
    priceCents: 8900,
    stock: 17,
    quality: 4.0,
    tags: ['hair-dryer', 'ionic', 'styling', 'fast-drying', 'appliance'],
    tagline: 'Half the drying time, none of the frizz.',
    description:
      'A 1875W ionic hair dryer with three heat settings, a cool shot button and two concentrator nozzles. Lightweight for easy styling.',
  },
  {
    name: 'Gentle Foaming Cleanser',
    brand: 'Lumière',
    category: 'beauty',
    priceCents: 1600,
    stock: 130,
    quality: 4.6,
    tags: ['skincare', 'cleanser', 'sensitive-skin', 'gentle', 'daily'],
    tagline: 'Clean without the tight feeling.',
    description:
      'A pH-balanced foaming cleanser with green tea and aloe that removes makeup and impurities without stripping the skin barrier. Suitable for sensitive skin.',
  },
  {
    name: 'Cedar & Sage Eau de Parfum',
    brand: 'Atelier Nord',
    category: 'beauty',
    priceCents: 7500,
    stock: 23,
    quality: 3.9,
    tags: ['fragrance', 'perfume', 'woody', 'unisex', 'gift'],
    tagline: 'A walk through a Nordic forest.',
    description:
      'A woody aromatic fragrance with notes of cedarwood, clary sage, bergamot and vetiver. Long-lasting and unisex. 50 ml.',
  },

  // --- Books ---
  {
    name: 'Designing Data-Intensive Systems',
    brand: 'Signal Press',
    category: 'books',
    priceCents: 4499,
    stock: 40,
    quality: 4.8,
    tags: ['programming', 'software', 'databases', 'engineering', 'hardcover'],
    tagline: 'The big ideas behind reliable, scalable systems.',
    description:
      'A deep yet readable tour of replication, partitioning, transactions and stream processing. Essential reading for backend engineers designing systems that scale.',
  },
  {
    name: 'The Mindful Kitchen Cookbook',
    brand: 'Harvest Books',
    category: 'books',
    priceCents: 2999,
    stock: 26,
    quality: 4.2,
    tags: ['cookbook', 'healthy', 'vegetarian', 'recipes', 'hardcover'],
    tagline: '120 seasonal recipes for everyday cooking.',
    description:
      'Simple, seasonal vegetarian recipes with weekly meal plans and pantry guides. Beautiful photography and recipes ready in under 30 minutes.',
  },
  {
    name: 'Atomic Routines',
    brand: 'Signal Press',
    category: 'books',
    priceCents: 1899,
    stock: 75,
    quality: 4.5,
    tags: ['self-help', 'habits', 'productivity', 'paperback', 'bestseller'],
    tagline: 'Small changes, remarkable results.',
    description:
      'A practical framework for building good habits and breaking bad ones, backed by behavioral science and filled with actionable strategies.',
  },
  {
    name: 'The Last Lighthouse',
    brand: 'Harbor House',
    category: 'books',
    priceCents: 1699,
    stock: 1,
    quality: 4.0,
    tags: ['fiction', 'mystery', 'novel', 'paperback', 'thriller'],
    tagline: 'Some secrets refuse to stay buried.',
    description:
      'A gripping literary mystery set on a remote Scottish island, where a lighthouse keeper’s disappearance unravels a decades-old secret.',
  },
  {
    name: 'Clean JavaScript Patterns',
    brand: 'Signal Press',
    category: 'books',
    priceCents: 3999,
    stock: 18,
    quality: 4.3,
    tags: ['programming', 'javascript', 'web', 'engineering', 'paperback'],
    tagline: 'Write code your teammates will thank you for.',
    description:
      'Practical patterns for readable, testable and maintainable modern JavaScript, from modules and async flows to error handling and testing.',
  },
  {
    name: 'Wild Trails: A Hiking Atlas',
    brand: 'Harbor House',
    category: 'books',
    priceCents: 3499,
    stock: 12,
    quality: 4.6,
    tags: ['travel', 'hiking', 'outdoors', 'atlas', 'hardcover'],
    tagline: '50 unforgettable hikes around the world.',
    description:
      'Detailed route maps, elevation profiles and stunning photography for fifty of the world’s most rewarding hikes, from day trips to multi-day treks.',
  },

  // --- Toys & Games ---
  {
    name: 'Galaxy Explorer Building Set',
    brand: 'Brickworks',
    category: 'toys-games',
    priceCents: 7999,
    stock: 24,
    quality: 4.7,
    tags: ['building', 'space', 'stem', 'kids', 'gift'],
    tagline: 'Build it, launch it, explore the stars.',
    description:
      'A 780-piece space shuttle building set with a detachable satellite, rover and two astronaut figures. Ages 9+.',
  },
  {
    name: 'Settlers of the Isle Board Game',
    brand: 'Meeple House',
    category: 'toys-games',
    priceCents: 4499,
    stock: 37,
    quality: 4.6,
    tags: ['board-game', 'strategy', 'family', 'party', '3-4-players'],
    tagline: 'Trade, build and settle your way to victory.',
    description:
      'A modern classic strategy game for 3–4 players. Collect resources, trade with friends and build settlements across a variable island board. 60–90 minutes.',
  },
  {
    name: 'Pocket Puzzle Cube 3x3',
    brand: 'Brainy',
    category: 'toys-games',
    priceCents: 1299,
    stock: 200,
    quality: 4.2,
    tags: ['puzzle', 'speed-cube', 'brain-teaser', 'travel', 'kids'],
    tagline: 'Smooth turning for speed solvers.',
    description:
      'A magnetic 3x3 speed cube with adjustable tension and corner cutting for fast, smooth solves. Stickerless design that never peels.',
  },
  {
    name: 'RC Stunt Car Twister',
    brand: 'Turbo Toys',
    category: 'toys-games',
    priceCents: 3999,
    stock: 0,
    quality: 3.5,
    tags: ['remote-control', 'car', 'stunt', 'kids', 'outdoor'],
    tagline: 'Flips, spins and 360° rolls.',
    description:
      'A double-sided remote control stunt car that flips, spins and drives on any surface. Rechargeable battery with 25 minutes of play. Ages 6+.',
  },
  {
    name: 'Wooden Rainbow Stacker',
    brand: 'Little Oak',
    category: 'toys-games',
    priceCents: 2499,
    stock: 44,
    quality: 4.8,
    tags: ['wooden', 'montessori', 'toddler', 'educational', 'eco-friendly'],
    tagline: 'Open-ended play, built to last.',
    description:
      'A 12-piece rainbow stacker made from sustainably sourced wood and non-toxic paints. Encourages creativity, balance and color recognition.',
  },
  {
    name: 'Mystery Escape Room Kit',
    brand: 'Meeple House',
    category: 'toys-games',
    priceCents: 2999,
    stock: 9,
    quality: 4.1,
    tags: ['escape-room', 'puzzle', 'party', 'family', 'cooperative'],
    tagline: 'Can you escape in 60 minutes?',
    description:
      'Turn your living room into an escape room. Solve interlocking puzzles and decode clues as a team. For 2–6 players, ages 12+.',
  },
];

const CATEGORY_COLORS = {
  electronics: ['1e293b', 'e2e8f0'],
  clothing: ['7c2d12', 'ffedd5'],
  shoes: ['14532d', 'dcfce7'],
  'home-kitchen': ['78350f', 'fef3c7'],
  'sports-outdoors': ['0c4a6e', 'e0f2fe'],
  beauty: ['831843', 'fce7f3'],
  books: ['312e81', 'e0e7ff'],
  'toys-games': ['713f12', 'fef9c3'],
};

/** Placeholder images until real ones are uploaded through the admin panel. */
export function placeholderImage(product) {
  const [bg, fg] = CATEGORY_COLORS[product.category];
  const text = encodeURIComponent(product.name).replace(/%20/g, '+');
  return { url: `https://placehold.co/800x800/${bg}/${fg}/png?text=${text}`, alt: product.name };
}

/** The product's Unsplash photo, or a placeholder for products without one. */
export function productImage(product) {
  const photo = PRODUCT_IMAGES[product.name];
  return photo ? { url: photo.url, alt: product.name } : placeholderImage(product);
}
