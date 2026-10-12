FROM node:24-alpine
WORKDIR /admin
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir /data && chown node:node /data
COPY src/ src/
COPY public/ public/
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "const s=require('net').connect(3100,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),2000)"
CMD ["node","src/server.js"]
