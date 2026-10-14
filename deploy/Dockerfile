# TILT on a server: the built app and the online relay on one port.
# Built by tools/deploy-tower.ts (which puts dist/ and tools/ next to this file).
FROM denoland/deno:2.5.6
WORKDIR /app
COPY tools/relay.ts tools/serve.ts ./tools/
COPY dist ./dist
# Files copied from Windows arrive owner-only: let the unprivileged server read them.
RUN chmod -R a+rX /app
USER deno
EXPOSE 8097
CMD ["run", "--allow-net", "--allow-read=/app/dist", "tools/serve.ts", "8097", "/app/dist"]
