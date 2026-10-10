package com.hanalingua.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/** HanaLingua v2.0: offline lessons, reading practice and short dialogues. */
public final class MainActivity extends Activity {
    private static final int BG=Color.rgb(248,249,252);
    private static final int INK=Color.rgb(27,35,51);
    private static final int MUTED=Color.rgb(105,115,132);
    private static final int OUTLINE=Color.rgb(227,232,240);
    private static final int PURPLE=Color.rgb(91,70,205);
    private static final int TEAL=Color.rgb(5,132,130);
    private static final int SUCCESS=Color.rgb(22,137,100);
    private static final int ERROR=Color.rgb(187,67,78);
    private SharedPreferences prefs;
    private TextToSpeech tts;
    private boolean ttsReady=false;
    private JSONObject data;
    private String language="ja";
    private boolean showRoman=true;
    private boolean slow=false;
    private int topicIndex=0;
    private int cardIndex=0;
    private int questionNumber=0;
    private int score=0;
    private boolean answered=false;
    private ArrayList<Integer> quizOrder = new ArrayList<>();
    private LinearLayout root;
    private LinearLayout body;
    private ScrollView scroll;
    private final Random random = new Random();

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        getWindow().setNavigationBarColor(Color.rgb(25,30,40));
        prefs=getSharedPreferences("hanalingua_reading_v2", Context.MODE_PRIVATE);
        language=prefs.getString("lang","ja");
        if(!language.equals("ja")&&!language.equals("ko"))language="ja";
        showRoman=prefs.getBoolean("roman",true);
        slow=prefs.getBoolean("slow",false);
        try (InputStream input=getAssets().open("lessons.json")){
            ByteArrayOutputStream output=new ByteArrayOutputStream();
            byte[] bytes=new byte[8192];int n;
            while((n=input.read(bytes))!=-1)output.write(bytes,0,n);
            data=new JSONObject(output.toString("UTF-8"));
        }catch(Exception e){
            new AlertDialog.Builder(this).setTitle("No se cargaron las lecciones").setMessage(e.toString()).setPositiveButton("Cerrar",(d,w)->finish()).show();
            return;
        }
        // Engine availability depends on voices installed on the device.
        tts=new TextToSpeech(this,status->{
            ttsReady=(status==TextToSpeech.SUCCESS);
            if(ttsReady && tts!=null)tts.setLanguage(locale());
        });
        home();
    }
    @Override protected void onDestroy(){
        if(tts!=null){tts.stop();tts.shutdown();}
        super.onDestroy();
    }
    private int d(float v){return (int)(v*getResources().getDisplayMetrics().density+0.5f);}
    private Locale locale(){return language.equals("ja")?Locale.JAPANESE:Locale.KOREAN;}
    private int accent(){return language.equals("ja")?PURPLE:TEAL;}
    private String courseName(){return language.equals("ja")?"Japonés":"Coreano";}
    private String originalName(){return language.equals("ja")?"日本語":"한국어";}
    private JSONArray topics(){return data.optJSONArray(language);}
    private JSONObject topic(){return topics().optJSONObject(topicIndex);}
    private JSONArray entries(){return topic().optJSONArray("items");}
    private JSONObject item(int index){return entries().optJSONObject(index);}
    private int count(){return entries().length();}
    private String idKey(int ix){return "best_"+language+"_"+ix;}
    private int best(int ix){return prefs.getInt(idKey(ix),0);}
    private GradientDrawable round(int color,int radius,int line){
        GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(d(radius));
        if(line!=0)g.setStroke(d(1),line);return g;
    }
    private TextView text(String s,int size,int color,boolean strong){
        TextView v=new TextView(this);
        v.setText(s);v.setTextSize(size);v.setTextColor(color);
        v.setFontFeatureSettings("kern");
        if(strong)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        v.setLineSpacing(d(3),1f);
        return v;
    }
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout horizontal(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private LinearLayout.LayoutParams params(int w,int h){return new LinearLayout.LayoutParams(w<0?w:d(w),h<0?h:d(h));}
    private void pad(View v,int l,int t,int r,int b){v.setPadding(d(l),d(t),d(r),d(b));}
    private void add(LinearLayout holder,View view,int t){
        LinearLayout.LayoutParams p=params(-1,-2);p.topMargin=d(t);holder.addView(view,p);
    }
    private void spacer(LinearLayout box,int h){View v=new View(this);box.addView(v,params(-1,h));}
    private TextView button(String s,int bg,int fg,Runnable run){
        TextView v=text(s,15,fg,true);v.setGravity(Gravity.CENTER);v.setBackground(round(bg,16,0));
        pad(v,18,15,18,15);v.setMinHeight(d(51));v.setOnClickListener(w->run.run());return v;
    }
    private TextView outlineButton(String s,Runnable run){
        TextView v=button(s,Color.WHITE,INK,run);v.setBackground(round(Color.WHITE,16,OUTLINE));return v;
    }
    private LinearLayout panel(){LinearLayout b=vertical();b.setBackground(round(Color.WHITE,22,OUTLINE));pad(b,18,18,18,18);return b;}
    private void heading(String title,String subtitle,Runnable back){
        root=vertical();root.setBackgroundColor(BG);
        setContentView(root);
        LinearLayout header=horizontal();pad(header,18,12,18,8);
        if(back!=null){
            TextView arrow=text("‹",35,INK,false);arrow.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams ap=params(42,48);ap.rightMargin=d(9);header.addView(arrow,ap);
            arrow.setOnClickListener(v->back.run());
        }
        LinearLayout labels=vertical();
        TextView name=text(title,24,INK,true);labels.addView(name);
        if(subtitle!=null&&!subtitle.isEmpty()){TextView sub=text(subtitle,12,MUTED,false);labels.addView(sub);}
        header.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(header,params(-1,-2));
        scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setClipToPadding(false);
        body=vertical();pad(body,18,8,18,28);
        scroll.addView(body,new ScrollView.LayoutParams(-1,-2));
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    }
    private void swapLang(String lang){language=lang;prefs.edit().putString("lang",lang).apply();if(tts!=null&&ttsReady)tts.setLanguage(locale());home();}
    private void speak(String word){
        if(!ttsReady||tts==null){Toast.makeText(this,"Activá una voz de "+courseName()+" en los ajustes de voz del teléfono.",Toast.LENGTH_LONG).show();return;}
        int status=tts.setLanguage(locale());
        if(status==TextToSpeech.LANG_MISSING_DATA||status==TextToSpeech.LANG_NOT_SUPPORTED){
            new AlertDialog.Builder(this).setTitle("Falta la voz de "+courseName())
                .setMessage("Instalá el idioma en los ajustes de síntesis de voz de Android para escuchar la pronunciación.")
                .setPositiveButton("Entendido",null).show();return;
        }
        tts.setSpeechRate(slow?0.72f:0.92f);
        tts.speak(word,TextToSpeech.QUEUE_FLUSH,null,"hl_phrase");
    }
    private void langSelector(LinearLayout box){
        LinearLayout line=horizontal();
        String[] langs={"ja","ko"};String[] names={"🇯🇵 Japonés","🇰🇷 Coreano"};
        for(int i=0;i<2;i++){
            final String lang=langs[i];boolean chosen=language.equals(lang);
            TextView b=text(names[i],15,chosen?Color.WHITE:INK,true);b.setGravity(Gravity.CENTER);
            pad(b,9,15,9,15);b.setBackground(round(chosen?accent():Color.WHITE,15,chosen?0:OUTLINE));
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);
            if(i!=0)p.leftMargin=d(8);line.addView(b,p);b.setOnClickListener(v->swapLang(lang));
        }
        add(box,line,12);
    }
    private void home(){
        heading("HanaLingua","Leé, escuchá y entendé a tu ritmo",null);
        langSelector(body);
        LinearLayout hero=panel();
        hero.setBackground(round(language.equals("ja")?Color.rgb(239,235,255):Color.rgb(229,247,245),22,0));
        TextView label=text("TU CURSO",12,accent(),true);hero.addView(label);
        TextView lang=text(originalName()+"  ·  "+courseName(),26,INK,true);add(hero,lang,6);
        add(hero,text("Aprendé con saludos, palabras útiles y conversaciones reales.",15,INK,false),8);
        int passed=0;for(int i=0;i<topics().length();i++)if(best(i)>=6)passed++;
        add(hero,text(""+passed+" de 10 temas practicados con éxito",13,MUTED,false),12);
        add(hero,button("Empezar a aprender  →",accent(),Color.WHITE,this::topicsPage),14);
        add(body,hero,16);
        TextView intro=text("¿Qué querés hacer hoy?",19,INK,true);add(body,intro,22);
        LinearLayout free=panel();
        add(free,text("Leer libremente",18,INK,true),0);
        add(free,text("Explorá palabras y tocá cualquiera para escuchar su sonido y ver qué significa.",14,MUTED,false),7);
        add(free,outlineButton("Abrir lectura libre  →",this::freeReading),14);add(body,free,11);
        LinearLayout progress=panel();
        add(progress,text("Mi progreso",18,INK,true),0);
        add(progress,text("Mirá tus mejores resultados y elegí qué repasar.",14,MUTED,false),7);
        add(progress,outlineButton("Ver mis avances  →",this::progressPage),14);add(body,progress,11);
        add(body,text("Sin registro · Sin anuncios · Contenido disponible sin conexión. El audio depende de las voces instaladas.",12,MUTED,false),22);
    }
    private void topicsPage(){
        heading("Lecciones","10 temas · para empezar desde cero",this::home);
        add(body,text("Leé las palabras y escuchalas antes de practicar. Podés repetir cualquier tema.",14,MUTED,false),3);
        JSONArray all=topics();
        for(int i=0;i<all.length();i++){
            final int j=i;JSONObject obj=all.optJSONObject(i);int bestScore=best(i);
            LinearLayout card=panel();
            LinearLayout line=horizontal();
            TextView num=text(String.format(Locale.ROOT,"%02d",i+1),18,accent(),true);
            num.setGravity(Gravity.CENTER);num.setBackground(round(language.equals("ja")?Color.rgb(239,235,255):Color.rgb(229,247,245),13,0));
            line.addView(num,params(52,52));
            LinearLayout labels=vertical();pad(labels,13,0,0,0);
            labels.addView(text(obj.optString("title"),17,INK,true));
            labels.addView(text(obj.optString("subtitle"),13,MUTED,false));
            line.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
            card.addView(line);
            add(card,text(bestScore>=6?"✓  Práctica superada: "+bestScore+"/8":bestScore>0?"Mejor resultado: "+bestScore+"/8":"Nuevo tema · 8 a 10 expresiones",12,bestScore>=6?SUCCESS:MUTED,false),13);
            card.setOnClickListener(v->{topicIndex=j;cardIndex=0;cards();});
            add(body,card,10);
        }
    }
    private void cards(){
        JSONObject topic=topic();JSONObject row=item(cardIndex);
        heading(topic.optString("title"),"Palabra "+(cardIndex+1)+" de "+count(),this::topicsPage);
        LinearLayout card=panel();pad(card,20,25,20,25);
        add(card,text("LEÉ EN "+courseName().toUpperCase(Locale.ROOT),12,accent(),true),0);
        TextView large=text(row.optString("text"),33,INK,true);large.setGravity(Gravity.CENTER);
        pad(large,8,14,8,10);add(card,large,10);
        if(showRoman){TextView roman=text(row.optString("reading"),16,MUTED,false);roman.setGravity(Gravity.CENTER);add(card,roman,2);}
        add(card,button("▶  Escuchar",accent(),Color.WHITE,()->speak(row.optString("text"))),18);
        TextView meaning=text(row.optString("es"),23,INK,true);meaning.setGravity(Gravity.CENTER);add(card,meaning,24);
        TextView note=text(row.optString("note"),13,MUTED,false);note.setGravity(Gravity.CENTER);add(card,note,8);
        add(body,card,12);
        add(body,outlineButton(showRoman?"Ocultar pronunciación escrita":"Mostrar pronunciación escrita",()->{
            showRoman=!showRoman;prefs.edit().putBoolean("roman",showRoman).apply();cards();
        }),12);
        add(body,outlineButton(slow?"Audio lento: activado":"Audio lento: desactivado",()->{
            slow=!slow;prefs.edit().putBoolean("slow",slow).apply();cards();
        }),9);
        LinearLayout nav=horizontal();
        TextView previous=outlineButton("← Anterior",()->{if(cardIndex>0){cardIndex--;cards();}});
        previous.setAlpha(cardIndex==0?0.38f:1);previous.setEnabled(cardIndex>0);
        nav.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
        TextView next=button(cardIndex==count()-1?"Practicar →":"Siguiente →",accent(),Color.WHITE,()->{
            if(cardIndex<count()-1){cardIndex++;cards();}else startQuiz();
        });
        LinearLayout.LayoutParams np=new LinearLayout.LayoutParams(0,-2,1);np.leftMargin=d(8);nav.addView(next,np);
        add(body,nav,15);
        add(body,outlineButton("Leer un diálogo de este tema",this::dialoguePage),12);
        add(body,text("Consejo: intentá reconocer los caracteres antes de mirar la pronunciación.",12,MUTED,false),17);
        scroll.scrollTo(0,0);
    }
    private void dialoguePage(){
        JSONArray lines=topic().optJSONArray("dialogue");
        heading("Diálogo: "+topic().optString("title"),"Leé una conversación corta",this::cards);
        add(body,text("Tocá «Escuchar» en cada línea. El español te ayuda a comprender lo que leíste.",14,MUTED,false),4);
        for(int i=0;i<lines.length();i++){
            JSONObject line=lines.optJSONObject(i);String utterance=line.optString("text");
            LinearLayout panel=panel();
            add(panel,text("PERSONA "+line.optString("speaker"),12,accent(),true),0);
            add(panel,text(utterance,23,INK,true),7);
            if(showRoman)add(panel,text(line.optString("reading"),14,MUTED,false),4);
            add(panel,text(line.optString("es"),15,INK,false),10);
            add(panel,outlineButton("▶ Escuchar",()->speak(utterance)),11);
            add(body,panel,11);
        }
        add(body,button("Practicar lo aprendido  →",accent(),Color.WHITE,this::startQuiz),16);
    }
    private void startQuiz(){
        quizOrder.clear();for(int i=0;i<count();i++)quizOrder.add(i);
        Collections.shuffle(quizOrder,random);
        questionNumber=0;score=0;answered=false;quizPage();
    }
    private List<String> answerOptions(int ix){
        List<String> result=new ArrayList<>();result.add(item(ix).optString("es"));
        List<String> others=new ArrayList<>();for(int i=0;i<count();i++)if(i!=ix){
            String meaning=item(i).optString("es");if(!meaning.equals(result.get(0))&&!others.contains(meaning))others.add(meaning);
        }
        Collections.shuffle(others,random);
        for(String choice:others){if(result.size()>=4)break;result.add(choice);}
        Collections.shuffle(result,random);return result;
    }
    private void quizPage(){
        answered=false;
        if(questionNumber>=Math.min(8,quizOrder.size())){quizResult();return;}
        int ix=quizOrder.get(questionNumber);JSONObject row=item(ix);
        heading("Practicá leyendo","Pregunta "+(questionNumber+1)+" de 8",this::cards);
        LinearLayout card=panel();
        add(card,text("¿QUÉ SIGNIFICA ESTA EXPRESIÓN?",13,accent(),true),0);
        TextView word=text(row.optString("text"),31,INK,true);word.setGravity(Gravity.CENTER);
        pad(word,6,22,6,20);add(card,word,4);
        add(card,outlineButton("▶ Escuchar",()->speak(row.optString("text"))),6);
        add(body,card,12);
        add(body,text("Elegí la traducción correcta:",15,INK,true),18);
        List<String> options=answerOptions(ix);
        LinearLayout optionsBox=vertical();add(body,optionsBox,3);
        LinearLayout feedbackBox=vertical();add(body,feedbackBox,10);
        String correct=row.optString("es");
        for(String option:options){
            TextView choice=outlineButton(option,()->{
                if(answered)return;
                answered=true;boolean right=option.equals(correct);
                if(right)score++;
                for(int j=0;j<optionsBox.getChildCount();j++){
                    View v=optionsBox.getChildAt(j);v.setEnabled(false);
                    if(v instanceof TextView){TextView tv=(TextView)v;
                        if(tv.getText().toString().equals(correct)){
                            tv.setBackground(round(Color.rgb(227,248,237),14,SUCCESS));tv.setTextColor(SUCCESS);
                        }else if(tv==null?false:tv.getText().toString().equals(option)){
                            tv.setBackground(round(Color.rgb(255,236,238),14,ERROR));tv.setTextColor(ERROR);
                        }
                    }
                }
                TextView result=text(right?"✓ ¡Correcto!":"La respuesta correcta es: "+correct,16,right?SUCCESS:ERROR,true);
                add(feedbackBox,result,8);
                add(feedbackBox,button(questionNumber==7?"Ver resultado  →":"Siguiente pregunta  →",accent(),Color.WHITE,()->{questionNumber++;quizPage();}),11);
            });
            add(optionsBox,choice,9);
        }
    }
    private void quizResult(){
        int old=best(topicIndex);
        if(score>old)prefs.edit().putInt(idKey(topicIndex),score).apply();
        boolean passed=score>=6;
        heading("Resultado","Tema: "+topic().optString("title"),this::topicsPage);
        LinearLayout card=panel();
        TextView big=text(score+" / 8",43,passed?SUCCESS:accent(),true);big.setGravity(Gravity.CENTER);
        add(card,big,10);
        TextView summary=text(passed?"¡Muy bien! Ya reconocés estas expresiones.":"Seguí practicando. Podés repetir todas las veces que quieras.",18,INK,true);
        summary.setGravity(Gravity.CENTER);add(card,summary,11);
        add(card,text("Se guarda automáticamente tu mejor resultado.",13,MUTED,false),12);
        add(body,card,16);
        add(body,button("Volver a estudiar este tema",accent(),Color.WHITE,()->{cardIndex=0;cards();}),12);
        add(body,outlineButton("Repetir práctica",this::startQuiz),9);
        add(body,outlineButton("Elegir otro tema",this::topicsPage),9);
    }
    private void freeReading(){
        heading("Lectura libre",courseName()+" · explorá y escuchá",this::home);
        add(body,text("Elegí cualquier expresión para ver su traducción y escucharla. No hay notas ni examen.",14,MUTED,false),5);
        JSONArray all=topics();
        for(int i=0;i<all.length();i++){
            JSONObject topic=all.optJSONObject(i);add(body,text(topic.optString("title"),19,INK,true),18);
            JSONArray rows=topic.optJSONArray("items");
            for(int j=0;j<rows.length();j++){
                JSONObject row=rows.optJSONObject(j);String orig=row.optString("text");
                LinearLayout line=vertical();pad(line,15,12,15,12);line.setBackground(round(Color.WHITE,15,OUTLINE));
                add(line,text(orig,21,INK,true),0);
                if(showRoman)add(line,text(row.optString("reading"),13,MUTED,false),4);
                add(body,line,7);
                line.setOnClickListener(v->{
                    new AlertDialog.Builder(this).setTitle(orig)
                        .setMessage((showRoman?row.optString("reading")+"\n\n":"")+row.optString("es")+"\n\n"+row.optString("note"))
                        .setPositiveButton("Escuchar",(di,which)->speak(orig))
                        .setNegativeButton("Cerrar",null).show();
                });
            }
        }
    }
    private void progressPage(){
        heading("Mis avances",courseName()+" · resultados por tema",this::home);
        int total=0;
        for(int i=0;i<topics().length();i++)total+=best(i);
        LinearLayout summary=panel();
        add(summary,text(""+total+" / 80",32,accent(),true),2);
        add(summary,text("Suma de tus mejores resultados",14,MUTED,false),6);
        add(body,summary,8);
        for(int i=0;i<topics().length();i++){
            final int ix=i;int mark=best(i);JSONObject topic=topics().optJSONObject(i);
            LinearLayout card=panel();
            add(card,text(topic.optString("title"),17,INK,true),0);
            add(card,text("Mejor práctica: "+mark+" / 8"+(mark>=6?"  ·  Superada":""),14,mark>=6?SUCCESS:MUTED,false),7);
            card.setOnClickListener(v->{topicIndex=ix;cardIndex=0;cards();});
            add(body,card,9);
        }
    }
    @Override public void onBackPressed(){
        // Consistent escape route from any learning screen.
        home();
    }
}
