#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss

echo "Seeding admin user..."
node -e "
const{PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const p=new PrismaClient();
(async()=>{
  const count=await p.user.count();
  if(count===0){
    const hash=await bcrypt.hash('admin123',10);
    const u=await p.user.create({data:{email:'admin@cugini.com.br',name:'Paulo Vitor',password:hash,role:'ADMIN'}});
    console.log('Admin criado:',u.email);
  }else{
    console.log('Users already exist, skipping seed');
  }
  await p.\$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
"

echo "Starting server..."
exec node apps/web/server.js
