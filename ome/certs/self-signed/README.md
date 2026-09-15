# Bundled placeholder certificate

`cert.pem` / `privkey.pem` / `chain.pem` here are a self-signed certificate generated for this repository, for `CN=your-domain` — the same idea as the `ssl-cert-snakeoil` package many Linux distros ship: a public, non-secret placeholder that exists purely so OvenMediaEngine's `<TLS>` block (`ome/conf/Server.xml`) has *something* valid to load and doesn't crash on boot before you've set up a real one.

**This key is public.** It's committed to this repository and known to anyone who clones it. Don't use it for anything that needs real security — no browser or media player will trust it either, so [SignedPolicy viewer links](../../../oven-console-prd.md) won't really work correctly until you replace it.

To use a real certificate instead (Let's Encrypt/certbot or similar), see the comment above this mount in `docker-compose.yml` and set `OME_TLS_CERT_NAME` in `.env` to your own certificate's directory name.
