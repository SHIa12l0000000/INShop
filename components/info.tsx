import { Empty } from "./ui";
const legal: Record<string, { title: string; sections: [string, string][] }> = {
  "privacy-policy": {
    title: "Privacy Policy",
    sections: [
      [
        "Information we collect",
        "INShop uses account details, delivery addresses, shopping activity, and order records to provide shopping and support services. Payment card details are processed by the payment provider and are not stored by INShop.",
      ],
      [
        "How information is used",
        "Information is used to fulfill orders, secure accounts, handle support requests and improve the shopping experience. Optional marketing communications require an appropriate preference or consent.",
      ],
      [
        "Your choices",
        "You can update profile information, download available account data and contact support to request deletion, subject to retention requirements for orders and applicable law.",
      ],
    ],
  },
  terms: {
    title: "Terms of Use",
    sections: [
      [
        "Shopping on INShop",
        "Products, availability and pricing are subject to confirmation. The server calculates the final amount before payment. Sample catalog merchandise is not offered for sale.",
      ],
      [
        "Your account",
        "Provide accurate information and protect your sign-in credentials. Do not attempt to access other customers’ accounts or interfere with platform operations.",
      ],
      [
        "Orders and support",
        "An order acknowledgement does not replace payment verification or fulfillment confirmation. Contact support if an order requires correction.",
      ],
    ],
  },
  "return-policy": {
    title: "Return Policy",
    sections: [
      [
        "Eligibility",
        "Eligibility depends on the product category, condition, delivery date and policy displayed on the product page. The store must confirm actual windows and exclusions before accepting live orders.",
      ],
      [
        "Requesting a return",
        "Select a delivered order, describe the issue and submit a return request. Keep packaging and accessories until the return is resolved.",
      ],
      [
        "Review and pickup",
        "Support reviews requests before arranging pickup or replacement. The approved process and timeline will be communicated in your order or support ticket.",
      ],
    ],
  },
  "refund-policy": {
    title: "Refund Policy",
    sections: [
      [
        "Refund processing",
        "Approved refunds are processed to the original payment source where supported. Cash-on-delivery refunds require a verified arrangement through support.",
      ],
      [
        "Timing",
        "Provider processing times vary. A refund is complete only after confirmation from the payment provider. Store-specific timelines require review before launch.",
      ],
    ],
  },
  "shipping-policy": {
    title: "Shipping Policy",
    sections: [
      [
        "Delivery availability",
        "Delivery depends on PIN code, product, stock and courier coverage. Estimates and charges must be confirmed before placing an order.",
      ],
      [
        "Tracking",
        "Shipment tracking appears in your order after dispatch. Contact support for a parcel marked delivered that you have not received.",
      ],
    ],
  },
  "cookie-policy": {
    title: "Cookie Policy",
    sections: [
      [
        "Essential storage",
        "INShop uses authentication cookies for secure sessions and browser storage for the guest cart, guest wishlist, theme, delivery PIN code and your choice to skip sign-in.",
      ],
      [
        "Your controls",
        "You can clear local browser storage at any time. This removes device-only shopping preferences. Authentication cookies are required for signed-in account features.",
      ],
    ],
  },
  "seller-policy": {
    title: "Seller Policy",
    sections: [
      [
        "Seller participation",
        "Seller registration is currently closed. Seller accounts may be provisioned through a secure administrator process after commercial, fulfillment and identity checks.",
      ],
      [
        "Seller responsibilities",
        "Sellers must supply accurate product information, lawful merchandise, valid inventory and clear warranty and return terms. Fees and payout schedules require a signed commercial agreement.",
      ],
    ],
  },
  "acceptable-use-policy": {
    title: "Acceptable Use Policy",
    sections: [
      [
        "Responsible use",
        "Do not submit deceptive reviews, abusive messages, unlawful listings, malicious uploads or attempts to bypass access controls.",
      ],
      [
        "Enforcement",
        "The store may restrict accounts and content after review. Decisions that affect an order should be handled through customer support.",
      ],
    ],
  },
};
export default function Info({ route }: { route: string }) {
  const key = route.slice(1);
  if (key === "setup")
    return (
      <article className="prose">
        <span className="eyebrow">STORE OWNER GUIDE</span>
        <h1>Connect. Review. Open your store.</h1>
        <p>
          INShop is currently a preview with a sample catalog. These steps are
          required before accepting customers and orders.
        </p>
        <h2>1. Connect authentication</h2>
        <p>
          Create a Supabase project, enable email verification, configure SMTP
          and add Google as an OAuth provider. Set SUPABASE_URL,
          SUPABASE_ANON_KEY and APP_URL in the hosting environment. Add your
          live /auth/callback URL to the redirect allowlist. Never put
          service-role keys in browser code.
        </p>
        <h2>2. Provision an administrator</h2>
        <p>
          Register and verify an account. A database operator must promote that
          exact user to admin. Enroll an authenticator under Account → Login &
          security. Administrator APIs require a verified two-factor session.
        </p>
        <h2>3. Connect payments</h2>
        <p>
          Configure Razorpay merchant credentials and a separate webhook signing
          secret. Register /api/payments/webhook for payment.captured events.
          Test payment success, failures and duplicate events before using live
          keys.
        </p>
        <h2>4. Prepare real operations</h2>
        <p>
          Replace the sample catalog with inventory you can actually fulfill.
          Configure shipping, taxes, legal policies, returns, customer support
          and backups. Sample products cannot be purchased.
        </p>
        <h2>5. Activate commerce</h2>
        <p>
          After testing the complete flow, enable COMMERCE_ENABLED in the
          hosting environment. Cash on delivery has a separate store setting.
          Review the project README for technical setup and remaining launch
          requirements.
        </p>
        <a className="button" href="/admin/demo">
          Explore the admin demo
        </a>
      </article>
    );
  if (key === "about")
    return (
      <article className="prose">
        <span className="eyebrow">HELLO, WE’RE INSHOP</span>
        <h1>Good finds for real life.</h1>
        <p>Everything you need. One smart shop.</p>
        <p>
          INShop brings everyday essentials and thoughtful upgrades together in
          a clear, easy-to-use shopping experience. From technology to home,
          beauty to the daily basket, find what fits your life.
        </p>
        <div className="setup-note">
          This is a new store preview. Products and prices are sample data until
          the store opens.
        </div>
        <a className="button" href="/search">
          Explore INShop
        </a>
      </article>
    );
  const page = legal[key];
  if (!page) return <Empty title="Looks like this aisle doesn’t exist." />;
  return (
    <article className="prose">
      <span className="eyebrow">INSHOP POLICIES</span>
      <h1>{page.title}</h1>
      <div className="setup-note">
        Draft policy — placeholder copy requiring legal review and
        store-specific details before production use.
      </div>
      {page.sections.map(([t, b]) => (
        <section key={t}>
          <h2>{t}</h2>
          <p>{b}</p>
        </section>
      ))}
      <p>
        For questions, visit the{" "}
        <a className="text-link" href="/help">
          Help Center
        </a>
        .
      </p>
    </article>
  );
}
