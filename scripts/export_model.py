import numpy as np, pandas as pd, json, re
D="/mnt/user-data/uploads/outputs/pssg0379/out/"
df=pd.read_csv(D+"analysis_dataset.csv").merge(pd.read_csv(D+"clusters.csv"),on="pid")
df["ambulatory_ord"]=df.ambulatory.map({"Non-ambulatory":0.0,"Limited":0.5,"Ambulatory":1.0})
F=["age_at_surgery","bmi","asa","n_comorbidities","major_cobb","kyphosis","coronal_balance","sagittal_balance","ambulatory_ord"]
d=df.dropna(subset=["P_cluster"]); y=d.P_cluster.astype(int).values; X=d[F].values.astype(float)
lo=np.nanpercentile(X,1,axis=0); hi=np.nanpercentile(X,99,axis=0)
Xc=np.clip(X,lo,hi)
Q=np.linspace(0.01,0.99,99)
qs={str(k):[np.round(np.nanquantile(Xc[y==k][:,j],Q),3).tolist() for j in range(len(F))] for k in (1,2,3)}
# self-check accuracy with the exported grid
R=hi-lo
def pred(x):
    o=~np.isnan(x); ds=[np.mean([np.mean(np.abs(x[j]-np.array(qs[str(k)][j])))/R[j] for j in np.where(o)[0]]) for k in (1,2,3)]
    return 1+int(np.argmin(ds))
print("resubstitution agreement", np.mean([pred(x)==t for x,t in zip(Xc,y)]).round(3))
prof={}
for k in (1,2,3):
    g=d[y==k]; prof[str(k)]={"n":int(len(g)),**{f:(None if g[f].isna().all() else round(float(g[f].median()),1)) for f in F},
        "pct_nonamb":round(100*(g.ambulatory.dropna()=="Non-ambulatory").mean(),1),
        "etiology":{e:round(100*v,1) for e,v in g.etiology_primary.value_counts(normalize=True).items()}}
t4=pd.read_csv(D+"Table4_PxS_outcomes.csv")
def ci(s):
    m=re.match(r"\s*([-+\d.]+)\s*\(([-+\d.]+)\s*(?:-|to)\s*([-+\d.]+)\)",str(s)); return [float(m.group(i)) for i in (1,2,3)] if m else None
grid=[]
for _,r in t4.iterrows():
    grid.append({"P":int(r.iloc[0][1]),"S":int(r.iloc[1][1]),"n":int(r.n),"major":ci(r.iloc[3]),"upror":ci(r.iloc[4]),
                 "deosq":ci(r.iloc[6]),"eosq_n":int(r.iloc[7]),"dcobb":float(r.iloc[8]),"reportable":r.iloc[9]=="Yes"})
out={"features":F,"lo":np.round(lo,3).tolist(),"hi":np.round(hi,3).tolist(),"quantiles":qs,"profiles":prof,"grid":grid}
json.dump(out,open("model.json","w"))
print(json.dumps(prof,indent=0)[:1500]); print(lo,hi)
