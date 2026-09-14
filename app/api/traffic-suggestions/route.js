export const dynamic="force-dynamic";
import { readLatestLearning } from "../../../lib/persistentLearningStore.js";

export async function GET(){
  try{
    const a=await readLatestLearning();
    const suggestions=[];
    for(const f of a?.findings||[]){
      if(f.type==="WINDOW_ACCURACY"&&f.data?.sampleSize>=3){
        suggestions.push({
          type:"WINDOW_ACCURACY",
          title:f.title,
          text:f.suggestion
        });
      }
    }
    if(!suggestions.length){
      suggestions.push({
        type:"LEARNING",
        title:"Operational learning active",
        text:"LCPTMS is collecting schedule, traffic, current, tide, wind, and official-window comparisons. No validated traffic adjustment is ready yet."
      });
    }
    return Response.json({generatedAt:a?.generatedAt||null,suggestions:suggestions.slice(0,3)},{headers:{"Cache-Control":"no-store"}});
  }catch{
    return Response.json({suggestions:[{type:"STATUS",title:"Traffic suggestions",text:"Learning history is not available yet."}]},{headers:{"Cache-Control":"no-store"}});
  }
}
