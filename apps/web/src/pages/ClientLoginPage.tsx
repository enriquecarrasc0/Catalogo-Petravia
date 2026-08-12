import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useClientLogin, useCurrentClient, useSaveClient } from "@/hooks/useClientAuth";

export default function ClientLoginPage(){
 const existing=useCurrentClient();
 const navigate=useNavigate();
 const save=useSaveClient();
 const [token,setToken]=useState("");
 const {mutate,isPending,error}=useClientLogin();
 if(existing) return <Navigate to="/catalogo" replace />;
 return <div className="min-h-screen flex items-center justify-center"><form className="p-6 border rounded" onSubmit={(e)=>{e.preventDefault(); mutate(token,{onSuccess:(c)=>{save(c); navigate('/catalogo');}})}}><h1>Acceso Cliente</h1><input value={token} onChange={e=>setToken(e.target.value)} placeholder="Token"/><button type="submit">Entrar</button>{error && <div>{(error as Error).message}</div>}</form></div>
}
